import type { DefineComponent } from 'vue'

export declare const FButton: DefineComponent<{ size?: 'small' | 'large'; disabled?: boolean }>
export declare const FCard: DefineComponent<{ title?: string }>
export declare const FInternal: DefineComponent<{}>
export declare function useTheme(): { dark: boolean }
export declare const version: string
