'use client';

/**
 * Глобальный error boundary: срабатывает, если ошибка произошла в корневом
 * layout (когда обычный error.tsx уже не может отрисоваться). Рендерит
 * собственные <html>/<body>, поэтому стили только инлайновые.
 */
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    console.error('Критическая ошибка приложения:', error);

    return (
        <html lang="ru">
            <body
                style={{
                    display: 'flex',
                    minHeight: '100vh',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '16px',
                    padding: '24px',
                    textAlign: 'center',
                    fontFamily: 'system-ui, sans-serif',
                    margin: 0,
                }}
            >
                <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Приложение временно недоступно</h2>
                <p style={{ color: '#71717a', maxWidth: '420px' }}>
                    Произошла критическая ошибка. Попробуйте обновить страницу.
                </p>
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
                    Обновить
                </button>
            </body>
        </html>
    );
}
