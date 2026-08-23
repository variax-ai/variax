import { initRendererTab } from './renderer-tab'
import { initExtractorTab } from './extractor-tab'
import { initWatermarkTab } from './watermark-tab'
import { showcaseDocument } from './showcase'

function selectTab(name: string): void {
  for (const tab of document.querySelectorAll<HTMLElement>('.tab')) {
    tab.classList.toggle('active', tab.dataset.tab === name)
  }
  for (const panel of document.querySelectorAll<HTMLElement>('.panel')) {
    panel.classList.toggle('active', panel.id === `${name}-panel`)
  }
}

const renderer = initRendererTab()
renderer.load(showcaseDocument)

initExtractorTab({
  onDocument(doc) {
    renderer.load(doc)
    selectTab('renderer')
  },
})

initWatermarkTab({
  sourceFrame() {
    const current = renderer.current()
    if (!current) return null
    // Stop the clock: the frame that gets marked should be the one on screen,
    // not whichever one the loop had reached by the time the models loaded.
    renderer.pause()
    return { canvas: current.canvas, timeMs: current.timeMs }
  },
})

for (const tab of document.querySelectorAll<HTMLElement>('.tab')) {
  tab.addEventListener('click', () => selectTab(tab.dataset.tab ?? 'renderer'))
}
