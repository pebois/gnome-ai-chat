export class RecursiveCharacterTextSplitter {
  private chunkSize: number
  private chunkOverlap: number
  private separators: string[]

  constructor(options: { chunkSize?: number; chunkOverlap?: number; separators?: string[] } = {}) {
    this.chunkSize = options.chunkSize ?? 1000
    this.chunkOverlap = options.chunkOverlap ?? 200
    this.separators = options.separators ?? ['\n\n', '\n', ' ', '']
  }

  public splitText(text: string): string[] {
    const finalChunks: string[] = []
    const pieces = this._recursiveSplit(text, this.separators)

    let currentChunk: string[] = []
    let currentLength = 0

    for (const piece of pieces) {
      if (currentLength + piece.length > this.chunkSize && currentChunk.length > 0) {
        finalChunks.push(currentChunk.join(''))

        let overlapWeight = 0
        const newChunk: string[] = []
        for (let i = currentChunk.length - 1; i >= 0; i--) {
          const p = currentChunk[i]
          if (overlapWeight + p.length <= this.chunkOverlap) {
            newChunk.unshift(p)
            overlapWeight += p.length
          } else {
            break
          }
        }
        currentChunk = newChunk
        currentLength = overlapWeight
      }
      currentChunk.push(piece)
      currentLength += piece.length
    }

    if (currentChunk.length > 0) {
      finalChunks.push(currentChunk.join(''))
    }

    return finalChunks
  }

  private _recursiveSplit(text: string, separators: string[]): string[] {
    const finalPieces: string[] = []
    let separator = separators[separators.length - 1]
    let remainingSeparators: string[] = []

    for (let i = 0; i < separators.length; i++) {
      const s = separators[i]
      if (s === '') {
        separator = s
        break
      }
      if (text.includes(s)) {
        separator = s
        remainingSeparators = separators.slice(i + 1)
        break
      }
    }

    const pieces = text.split(separator)
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i]
      const isLast = i === pieces.length - 1
      const pieceWithSeparator = isLast ? piece : piece + separator

      if (pieceWithSeparator.length <= this.chunkSize) {
        finalPieces.push(pieceWithSeparator)
      } else if (remainingSeparators.length > 0) {
        finalPieces.push(...this._recursiveSplit(pieceWithSeparator, remainingSeparators))
      } else {
        finalPieces.push(pieceWithSeparator)
      }
    }

    return finalPieces
  }
}
