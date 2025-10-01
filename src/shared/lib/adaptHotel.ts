import { TravelOption } from '@/shared/api/reserve/reserve'
import { Option } from '@/components/ui/multiple-selector'

export const adaptToOption = (item: {
  id: string
  title: string
}): TravelOption => ({
  id: item.id,
  label: item.title,
})

export const adaptToMultipleSelectorOption = (item: {
  id: string
  title: string
}): Option => ({
  value: item.id,
  label: item.title,
})
