using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

internal static class BaobaoBusLauncher
{
    private const string AppUrl = "http://127.0.0.1:8787";
    private const string HealthUrl = AppUrl + "/api/health";
    private const string ShutdownUrl = AppUrl + "/api/shutdown";
    private const string MutexName = "Local\\BaobaoBusDesktopLauncher";
    private static readonly object LogLock = new object();
    private static string logFile = "";

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr state);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr window, StringBuilder text, int count);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr window);

    [DllImport("user32.dll")]
    private static extern bool IsWindow(IntPtr window);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr window);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr window, int command);

    private delegate bool EnumWindowsProc(IntPtr window, IntPtr state);

    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        bool ownsMutex;
        using (var mutex = new Mutex(true, MutexName, out ownsMutex))
        {
            if (!ownsMutex)
            {
                FocusExistingWindow();
                return;
            }

            try
            {
                Run();
            }
            catch (Exception error)
            {
                Log(error.ToString());
                MessageBox.Show(error.Message, "宝宝巴士启动失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }

    private static void Run()
    {
        var root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
        var appData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "宝宝巴士");
        Directory.CreateDirectory(appData);
        logFile = Path.Combine(appData, "launcher.log");

        var serverFile = Path.Combine(root, "server", "index.js");
        var frontendFile = Path.Combine(root, "dist", "index.html");
        if (!File.Exists(serverFile) || !File.Exists(frontendFile))
            throw new InvalidOperationException("程序文件不完整。请先运行 npm install 和 npm run build，或重新下载完整轻量版。");

        Process backend = null;
        string profile = null;
        try
        {
            if (!IsHealthy())
            {
                var node = FindNode(root);
                if (node == null)
                {
                    var result = MessageBox.Show(
                        "未找到 Node.js 22 或更高版本。\n\n宝宝巴士轻量版复用本机 Node 和 Edge，因此不会携带上百 MB 的 Chromium。是否打开 Node.js 下载页？",
                        "需要安装 Node.js",
                        MessageBoxButtons.YesNo,
                        MessageBoxIcon.Information);
                    if (result == DialogResult.Yes) Process.Start("https://nodejs.org/zh-cn/download");
                    return;
                }
                backend = StartBackend(node, root, serverFile, appData);
                if (!WaitForHealth(backend, 30000))
                    throw new InvalidOperationException("本地服务没有成功启动。详情请查看：\n" + logFile);
            }

            var browser = FindEdge();
            if (browser == null)
                throw new InvalidOperationException("未找到 Microsoft Edge。Windows 10/11 通常已自带 Edge，请修复或重新安装后再试。");

            profile = Path.Combine(Path.GetTempPath(), "BaobaoBusEdgeProfile");
            TryDeleteProfile(profile);
            var existingWindows = CaptureAppWindows();
            var edge = StartEdge(browser, profile);
            try { WaitForAppWindowToClose(edge, existingWindows); }
            finally { edge.Dispose(); }
        }
        finally
        {
            StopBackend(backend);
            if (profile != null) TryDeleteProfile(profile);
        }
    }

    private static Process StartBackend(string node, string root, string serverFile, string appData)
    {
        var info = new ProcessStartInfo
        {
            FileName = node,
            Arguments = Quote(serverFile),
            WorkingDirectory = root,
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        info.EnvironmentVariables["BAOBAO_CONFIG_DIR"] = appData;
        info.EnvironmentVariables["BAOBAO_DATA_DIR"] = Path.Combine(root, "data");

        var process = new Process { StartInfo = info, EnableRaisingEvents = true };
        process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs args) { if (args.Data != null) Log(args.Data); };
        process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs args) { if (args.Data != null) Log(args.Data); };
        if (!process.Start()) throw new InvalidOperationException("无法启动本地服务。");
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        return process;
    }

    private static Process StartEdge(string browser, string profile)
    {
        var args = "--app=" + Quote(AppUrl)
            + " --user-data-dir=" + Quote(profile)
            + " --guest --disable-sync"
            + " --no-first-run --no-default-browser-check --disable-background-mode --disable-extensions"
            + " --window-size=1180,820";
        if (Environment.GetEnvironmentVariable("BAOBAO_START_HIDDEN") == "1")
            args += " --headless=new --disable-gpu";
        var process = Process.Start(new ProcessStartInfo
        {
            FileName = browser,
            Arguments = args,
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden
        });
        if (process == null) throw new InvalidOperationException("无法打开应用窗口。");
        return process;
    }

    private static string FindNode(string root)
    {
        var configured = Environment.GetEnvironmentVariable("BAOBAO_NODE");
        if (!String.IsNullOrWhiteSpace(configured) && File.Exists(configured)) return configured;

        var portable = Path.Combine(root, "runtime", "node.exe");
        if (File.Exists(portable)) return portable;

        var path = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (var item in path.Split(Path.PathSeparator))
        {
            try
            {
                var candidate = Path.Combine(item.Trim().Trim('"'), "node.exe");
                if (File.Exists(candidate)) return candidate;
            }
            catch { }
        }
        return null;
    }

    private static string FindEdge()
    {
        var configured = Environment.GetEnvironmentVariable("BAOBAO_BROWSER");
        if (!String.IsNullOrWhiteSpace(configured) && File.Exists(configured)) return configured;

        var candidates = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Microsoft", "Edge", "Application", "msedge.exe")
        };
        foreach (var candidate in candidates) if (File.Exists(candidate)) return candidate;
        return null;
    }

    private static bool WaitForHealth(Process backend, int timeoutMilliseconds)
    {
        var deadline = DateTime.UtcNow.AddMilliseconds(timeoutMilliseconds);
        while (DateTime.UtcNow < deadline)
        {
            if (backend != null && backend.HasExited) return false;
            if (IsHealthy()) return true;
            Thread.Sleep(250);
        }
        return false;
    }

    private static bool IsHealthy()
    {
        try
        {
            var request = (HttpWebRequest)WebRequest.Create(HealthUrl);
            request.Timeout = 800;
            request.ReadWriteTimeout = 800;
            using (var response = (HttpWebResponse)request.GetResponse())
            using (var reader = new StreamReader(response.GetResponseStream()))
                return response.StatusCode == HttpStatusCode.OK && reader.ReadToEnd().Contains("\"app\":\"baobao-bus\"");
        }
        catch { return false; }
    }

    private static void WaitForAppWindowToClose(Process edge, HashSet<IntPtr> existingWindows)
    {
        // Edge 是多进程应用：启动进程可能退出或在窗口关闭后继续驻留，不能用
        // Process.WaitForExit() 代表桌面窗口的生命周期。
        if (Environment.GetEnvironmentVariable("BAOBAO_START_HIDDEN") == "1")
        {
            var hiddenDeadline = DateTime.UtcNow.AddSeconds(30);
            while (DateTime.UtcNow < hiddenDeadline && !edge.HasExited) Thread.Sleep(100);
            return;
        }

        var appWindow = IntPtr.Zero;
        var openDeadline = DateTime.UtcNow.AddSeconds(30);
        while (DateTime.UtcNow < openDeadline && appWindow == IntPtr.Zero)
        {
            appWindow = FindNewAppWindow(existingWindows);
            if (appWindow == IntPtr.Zero) Thread.Sleep(100);
        }
        if (appWindow == IntPtr.Zero) throw new InvalidOperationException("应用窗口没有成功打开。");

        // 只跟踪本次启动创建的系统窗口句柄；标题变化和 Edge 后台进程都不会干扰退出。
        while (IsWindow(appWindow)) Thread.Sleep(150);
    }

    private static HashSet<IntPtr> CaptureAppWindows()
    {
        var windows = new HashSet<IntPtr>();
        EnumWindows(delegate(IntPtr window, IntPtr state)
        {
            if (IsAppWindow(window)) windows.Add(window);
            return true;
        }, IntPtr.Zero);
        return windows;
    }

    private static IntPtr FindNewAppWindow(HashSet<IntPtr> existingWindows)
    {
        var found = IntPtr.Zero;
        EnumWindows(delegate(IntPtr window, IntPtr state)
        {
            if (!existingWindows.Contains(window) && IsAppWindow(window))
            {
                found = window;
                return false;
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    private static bool IsAppWindow(IntPtr window)
    {
        if (!IsWindowVisible(window)) return false;
        var text = new StringBuilder(512);
        GetWindowText(window, text, text.Capacity);
        return text.ToString().IndexOf("宝宝巴士", StringComparison.OrdinalIgnoreCase) >= 0;
    }

    private static void StopBackend(Process backend)
    {
        TryShutdown();
        if (backend == null) return;
        try
        {
            if (backend.HasExited) return;
            if (!backend.WaitForExit(4000)) backend.Kill();
        }
        catch
        {
            try { if (!backend.HasExited) backend.Kill(); } catch { }
        }
        finally
        {
            backend.Dispose();
        }
    }

    private static bool TryShutdown()
    {
        try
        {
            // 关闭桌面窗口就是明确退出应用；即使生成任务仍在运行也要终止服务。
            var bytes = Encoding.UTF8.GetBytes("{\"force\":true}");
            var request = (HttpWebRequest)WebRequest.Create(ShutdownUrl);
            request.Method = "POST";
            request.ContentType = "application/json; charset=utf-8";
            request.ContentLength = bytes.Length;
            request.Timeout = 2000;
            using (var stream = request.GetRequestStream()) stream.Write(bytes, 0, bytes.Length);
            using (var response = (HttpWebResponse)request.GetResponse())
            using (var reader = new StreamReader(response.GetResponseStream()))
                return reader.ReadToEnd().Contains("\"ok\":true");
        }
        catch { return false; }
    }

    private static void FocusExistingWindow()
    {
        EnumWindows(delegate(IntPtr window, IntPtr state)
        {
            if (!IsWindowVisible(window)) return true;
            var text = new StringBuilder(512);
            GetWindowText(window, text, text.Capacity);
            if (text.ToString().IndexOf("宝宝巴士", StringComparison.OrdinalIgnoreCase) < 0) return true;
            ShowWindow(window, 9);
            SetForegroundWindow(window);
            return false;
        }, IntPtr.Zero);
    }

    private static void TryDeleteProfile(string profile)
    {
        try
        {
            var expected = Path.GetFullPath(Path.Combine(Path.GetTempPath(), "BaobaoBusEdgeProfile"));
            var target = Path.GetFullPath(profile);
            if (String.Equals(target, expected, StringComparison.OrdinalIgnoreCase) && Directory.Exists(target))
                Directory.Delete(target, true);
        }
        catch { }
    }

    private static string Quote(string value)
    {
        return "\"" + value.Replace("\"", "\\\"") + "\"";
    }

    private static void Log(string message)
    {
        if (String.IsNullOrWhiteSpace(logFile)) return;
        try
        {
            lock (LogLock) File.AppendAllText(logFile, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss ") + message + Environment.NewLine, Encoding.UTF8);
        }
        catch { }
    }
}
