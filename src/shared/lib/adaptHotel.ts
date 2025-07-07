import { TravelOption } from '@/shared/api/reserve/reserve'
import { DefaultOptionType } from 'rc-select/es/Select'

export const adaptToOption = (item: {
  id: string
  title: string
}): TravelOption => ({
  id: item.id,
  label: item.title,
})

export const adaptToAntOption = (item: {
  id: string
  title: string
}): DefaultOptionType => ({
  value: item.id,
  label: item.title,
})
