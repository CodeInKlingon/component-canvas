import type { DesignerPropMetadata } from '@component-canvas/shared'

export interface NativeElementMetadata {
  tag: string
  label: string
  category: 'Structure' | 'Text' | 'Forms' | 'Media' | 'Lists'
  contentModel: 'normal' | 'text' | 'void'
  defaultContent?: string
  defaultChildren?: string
  attributes?: Record<string, string | number | boolean>
  props: DesignerPropMetadata[]
}

const text = (name: string, description = ''): DesignerPropMetadata => ({
  name, type: 'string', description, required: false, control: 'text',
})
const number = (name: string): DesignerPropMetadata => ({
  name, type: 'number', description: '', required: false, control: 'number',
})
const boolean = (name: string): DesignerPropMetadata => ({
  name, type: 'boolean', description: '', required: false, control: 'checkbox',
})
const select = (name: string, options: string[]): DesignerPropMetadata => ({
  name, type: options.map((option) => JSON.stringify(option)).join(' | '), description: '', required: false, control: 'select', options,
})
const global = [text('id'), text('class'), text('title')]

export const nativeElements: NativeElementMetadata[] = [
  ...['div', 'section', 'main', 'header', 'footer', 'nav', 'article'].map((tag) => ({
    tag, label: tag === 'div' ? 'Container' : `${tag[0]?.toUpperCase()}${tag.slice(1)}`,
    category: 'Structure' as const, contentModel: 'normal' as const,
    defaultContent: tag === 'div' ? 'Container' : `${tag[0]?.toUpperCase()}${tag.slice(1)} content`, props: global,
  })),
  { tag: 'p', label: 'Paragraph', category: 'Text', contentModel: 'text', defaultContent: 'Paragraph text', props: global },
  { tag: 'span', label: 'Span', category: 'Text', contentModel: 'text', defaultContent: 'Text', props: global },
  ...['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((tag) => ({
    tag, label: `Heading ${tag.slice(1)}`, category: 'Text' as const, contentModel: 'text' as const,
    defaultContent: 'Heading', props: global,
  })),
  { tag: 'strong', label: 'Strong', category: 'Text', contentModel: 'text', defaultContent: 'Strong text', props: global },
  {
    tag: 'a', label: 'Link', category: 'Text', contentModel: 'text', defaultContent: 'Link text', attributes: { href: '#' },
    props: [text('href'), select('target', ['_self', '_blank', '_parent', '_top']), text('rel'), ...global],
  },
  {
    tag: 'button', label: 'Button', category: 'Forms', contentModel: 'text', defaultContent: 'Button', attributes: { type: 'button' },
    props: [select('type', ['button', 'submit', 'reset']), text('name'), text('value'), boolean('disabled'), ...global],
  },
  {
    tag: 'input', label: 'Input', category: 'Forms', contentModel: 'void', attributes: { type: 'text' },
    props: [select('type', ['text', 'email', 'number', 'password', 'checkbox', 'radio']), text('name'), text('value'), text('placeholder'), boolean('disabled'), boolean('required'), boolean('checked'), ...global],
  },
  { tag: 'label', label: 'Label', category: 'Forms', contentModel: 'text', defaultContent: 'Label', props: [text('for'), ...global] },
  {
    tag: 'textarea', label: 'Textarea', category: 'Forms', contentModel: 'text', defaultContent: 'Text',
    props: [text('name'), text('placeholder'), number('rows'), number('cols'), boolean('disabled'), boolean('required'), ...global],
  },
  {
    tag: 'select', label: 'Select', category: 'Forms', contentModel: 'normal', defaultChildren: '<option value="">Option</option>',
    props: [text('name'), boolean('disabled'), boolean('required'), boolean('multiple'), ...global],
  },
  {
    tag: 'option', label: 'Option', category: 'Forms', contentModel: 'text', defaultContent: 'Option',
    props: [text('value'), boolean('disabled'), boolean('selected')],
  },
  {
    tag: 'img', label: 'Image', category: 'Media', contentModel: 'void', attributes: { src: '', alt: '' },
    props: [text('src'), text('alt'), number('width'), number('height'), text('loading'), ...global],
  },
  { tag: 'ul', label: 'Unordered list', category: 'Lists', contentModel: 'normal', defaultChildren: '<li>List item</li>', props: global },
  { tag: 'ol', label: 'Ordered list', category: 'Lists', contentModel: 'normal', defaultChildren: '<li>List item</li>', props: [number('start'), boolean('reversed'), ...global] },
  { tag: 'li', label: 'List item', category: 'Lists', contentModel: 'text', defaultContent: 'List item', props: [text('value'), ...global] },
]
