import a from './data/a.tsv?raw'
import b from './data/b.tsv?raw'
import c from './data/c.tsv?raw'
import d from './data/d.tsv?raw'
import e from './data/e.tsv?raw'
import { buildBook, type Book } from './book'

let book: Book | null = null

export function getBook(): Book {
  book ??= buildBook([a, b, c, d, e])
  return book
}
