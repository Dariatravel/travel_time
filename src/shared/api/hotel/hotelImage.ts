import supabase from '@/shared/config/supabase'

/**
 * Загружает изображение отеля в Supabase Storage
 * @param file - файл изображения
 * @returns путь к загруженному изображению
 */
export const uploadHotelImage = async (file: File): Promise<string> => {
  const fileExt = file.name.split('.').pop()
  const fileName = `${Date.now()}.${fileExt}`
  const filePath = `hotels/${fileName}`

  const { error: uploadError } = await supabase.storage
    .from('hotels')
    .upload(filePath, file)

  if (uploadError) {
    throw new Error('Ошибка при загрузке изображения')
  }

  return filePath
}

/**
 * Получает публичный URL изображения отеля
 * @param path - путь к изображению в Supabase Storage
 * @returns публичный URL изображения
 */
export const getHotelImageUrl = (path: string): string => {
  const { data } = supabase.storage.from('hotels').getPublicUrl(path)
  return data.publicUrl
}

/**
 * Удаляет изображение отеля из Supabase Storage
 * @param path - путь к изображению в Supabase Storage
 */
export const deleteHotelImage = async (path: string): Promise<void> => {
  const { error } = await supabase.storage.from('hotels').remove([path])

  if (error) {
    throw new Error('Ошибка при удалении изображения')
  }
}
