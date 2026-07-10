'use client';

import { useEffect } from 'react';

/**
 * Error boundary уровня приложения: перехватывает ошибки рендера на любой
 * странице, чтобы вместо белого экрана пользователь видел сообщение и мог
 * восстановить работу без потери сессии.
 */
export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('Ошибка рендера страницы:', error);
    }, [error]);

    return (
        <div
            style={{
                display: 'flex',
                minHeight: '60vh',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '16px',
                padding: '24px',
                textAlign: 'center',
            }}
        >
            <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Что-то пошло не так</h2>
            <p style={{ color: '#71717a', maxWidth: '420px' }}>
                Произошла ошибка при отображении страницы. Попробуйте обновить её — данные не
                потеряны.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
                <button
                    type="button"
                    onClick={reset}
                    style={{
                        padding: '8px 20px',
                        borderRadius: '8px',
                        border: '1px solid #d4d4d8',
                        background: '#18181b',
                        color: '#fff',
                        cursor: 'pointer',
                    }}
                >
                    Попробовать снова
                </button>
                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    style={{
                        padding: '8px 20px',
                        borderRadius: '8px',
                        border: '1px solid #d4d4d8',
                        background: '#fff',
                        color: '#18181b',
                        cursor: 'pointer',
                    }}
                >
                    Обновить страницу
                </button>
            </div>
        </div>
    );
}
