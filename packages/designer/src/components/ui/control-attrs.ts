import type { ClassValue, StyleValue } from 'vue'

/**
 * Splits fallthrough attributes so layout (`class`, `style`) lands on a control's
 * outer element while everything else, including listeners, lands on the native control.
 */
export function splitControlAttrs(attrs: Record<string, unknown>): {
  root: { class?: ClassValue; style?: StyleValue }
  control: Record<string, unknown>
} {
  const { class: className, style, ...control } = attrs
  return { root: { class: className as ClassValue, style: style as StyleValue }, control }
}
