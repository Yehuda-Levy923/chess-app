import { createContext, useContext } from 'react'

/**
 * Whether the page around a component is on screen. Pages stay mounted while
 * hidden, and react-chessboard throws when it measures a board on a hidden
 * page, so boards check this before rendering.
 */
export const PageVisible = createContext(true)

export const usePageVisible = () => useContext(PageVisible)
