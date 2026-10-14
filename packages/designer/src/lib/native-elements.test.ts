import { describe, expect, it } from 'vitest'
import { nativeElements } from './native-elements'

describe('native element metadata', () => {
  it('contains the curated MVP element set', () => {
    const tags = nativeElements.map((element) => element.tag)
    expect(tags).toEqual(expect.arrayContaining([
      'div', 'section', 'main', 'header', 'footer', 'nav', 'article',
      'p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'a',
      'button', 'input', 'label', 'textarea', 'select', 'option',
      'img', 'ul', 'ol', 'li',
    ]))
  })

  it('describes void elements and required inspector controls', () => {
    const input = nativeElements.find((element) => element.tag === 'input')!
    const image = nativeElements.find((element) => element.tag === 'img')!
    const anchor = nativeElements.find((element) => element.tag === 'a')!
    expect(input.contentModel).toBe('void')
    expect(image.contentModel).toBe('void')
    expect(image.props.map((prop) => prop.name)).toEqual(expect.arrayContaining(['src', 'alt', 'width', 'height']))
    expect(anchor.props.map((prop) => prop.name)).toEqual(expect.arrayContaining(['href', 'target', 'rel']))
    for (const name of ['disabled', 'required', 'checked']) {
      expect(input.props.find((prop) => prop.name === name)?.control).toBe('checkbox')
    }
  })
})
