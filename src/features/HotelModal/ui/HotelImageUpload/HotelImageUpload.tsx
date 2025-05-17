import React, { FC, useCallback } from 'react'
import { DragNDropField } from '@consta/uikit/DragNDropField'
import { Button } from '@consta/uikit/Button'
import { Text } from '@consta/uikit/Text'
import cn from 'classnames'
import { useMutation } from '@tanstack/react-query'
import { uploadHotelImage } from '@/shared/api/hotel/hotelImage'
import { toast } from 'react-toastify'
import styles from './style.module.css'

export interface HotelImageUploadProps {
  value?: { id: string; file: File } | null
  onChange: (value: { id: string; file: File } | null) => void
  disabled?: boolean
  error?: string
}

/**
 * Компонент для загрузки изображения отеля
 * @param value - текущее значение изображения
 * @param onChange - функция изменения значения
 * @param disabled - флаг отключения компонента
 * @param error - текст ошибки
 */
export const HotelImageUpload: FC<HotelImageUploadProps> = ({
  value,
  onChange,
  disabled = false,
  error,
}) => {
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const path = await uploadHotelImage(file)
      return { id: path, file }
    },
    onError: error => {
      toast.error(error.message)
    },
  })

  React.useEffect(() => {
    if (value?.file) {
      const url = URL.createObjectURL(value.file)
      setPreviewUrl(url)
      return () => URL.revokeObjectURL(url)
    } else {
      setPreviewUrl(null)
    }
  }, [value])

  const handleDropFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return

      const file = files[0]
      if (!file.type.startsWith('image/')) {
        toast.error('Пожалуйста, загрузите изображение')
        return
      }

      if (value) {
        toast.info('Изображение изменено')
      }

      try {
        const result = await uploadMutation.mutateAsync(file)
        onChange(result)
      } catch (error) {
        // Ошибка уже обработана в mutation
      }
    },
    [value, onChange, uploadMutation]
  )

  const handleRemoveImage = useCallback(() => {
    onChange(null)
    toast.info('Изображение удалено')
  }, [onChange])

  return (
    <div className={styles.container}>
      <DragNDropField
        accept={'image/*'}
        onDropFiles={handleDropFiles}
        multiple={false}
        disabled={disabled}
        className={cn(styles.fields, styles.imageUpload, {
          [styles.error]: error,
        })}
      >
        {({ openFileDialog }) => (
          <div className={styles.imageContainer}>
            <Button
              onClick={openFileDialog}
              label="Выбрать файл"
              size="s"
              disabled={disabled}
            />
            <br />
            <Text view="primary" size="s">
              Перетащите изображения или загрузите
            </Text>
            <Text view="secondary" size="s">
              Поддерживаемые форматы: PNG, TIFF, JPG
            </Text>
            {error && (
              <Text view="alert" size="s">
                {error}
              </Text>
            )}
          </div>
        )}
      </DragNDropField>

      {previewUrl && (
        <div className={styles.previewContainer}>
          <img src={previewUrl} alt="Preview" className={styles.preview} />
          <Button
            onClick={handleRemoveImage}
            label="Удалить изображение"
            view="ghost"
            size="s"
            className={styles.removeButton}
          />
        </div>
      )}
    </div>
  )
}
