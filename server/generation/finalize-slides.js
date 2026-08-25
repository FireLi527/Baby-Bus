import { paginateCourseSlides } from '../parse.js'

/** 业务分页只在这里发生；渲染器只消费最终页面。 */
export function finalizeSlides(slides) {
  return paginateCourseSlides(Array.isArray(slides) ? slides : [])
}

/** 将最终 HTML 页码直接映射到页面携带的 agendaIndex。 */
export function problemSectionIndexes(problems, finalSlides, sectionResults) {
  const targets = new Set()
  const slides = Array.isArray(finalSlides) ? finalSlides : []
  for (const problem of (problems || [])) {
    const match = /第(\d+)页/.exec(String(problem))
    if (!match) continue
    const slide = slides[parseInt(match[1], 10) - 1]
    if (slide && Number.isInteger(slide.agendaIndex)) targets.add(slide.agendaIndex)
  }
  for (let index = 0; index < (sectionResults || []).length; index++) {
    if (!sectionResults[index] || !sectionResults[index].length) targets.add(index)
  }
  return [...targets]
}
