// 术语库兼容门面：每门课程单独储存；同一课程的多份课件共享，课程之间完全隔离。
export {
  deriveGlossaryFromSlides,
  glossaryLabel,
  mergeGlossary,
  normalizeGlossaryItem,
  normalizeGlossaryList,
} from './glossary/model.js'

export {
  glossaryStoreFile,
  readGlossaryStore,
  recoverEmptyGlossaries,
  refreshGlossaryView,
  writeGlossaryStore,
} from './glossary/store.js'

export {
  buildGlossaryHtml,
  glossaryVersion,
  glossaryViewFile,
} from './glossary/view.js'
