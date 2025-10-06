/**
 * Example TypeScript file to test quality checks
 */

interface DataItem {
  value: number
  enabled: boolean
}

export const processData = (data: DataItem[]): number[] => {
  const result = data.map((item: DataItem) => {
    return item.value * 2
  })

  return result
}

export const unusedVariable = 'this is not used'

export class DataProcessor {
  private data: DataItem[]

  constructor(data: DataItem[]) {
    this.data = data
  }

  process(): DataItem[] {
    return this.data.filter((item: DataItem) => item.enabled)
  }
}
