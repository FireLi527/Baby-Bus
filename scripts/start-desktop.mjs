import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const child = spawn(path.join(root, '宝宝巴士.exe'), [], {
  cwd: root,
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
})
child.unref()
