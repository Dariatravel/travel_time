// Запуск фонового mirror-крона (GitHub Actions workflow_dispatch) по кнопке
// «Обновить» для медленных Shelter-отелей. Синхронно читать FrontDesk24 у них
// нельзя (~200с > лимита 30с), поэтому кнопка стартует крон, а он дописывает
// занятость в фоне (и по расписанию каждые 2 часа).

const OWNER = 'Dariatravel';
const REPO = 'travel_time';
const WORKFLOW_FILE = 'mirror-sync-cron.yml';

export const dispatchMirrorCron = async (): Promise<void> => {
    const token = process.env.GITHUB_DISPATCH_TOKEN;
    if (!token) {
        throw new Error('Фоновое обновление не настроено (нет GITHUB_DISPATCH_TOKEN)');
    }
    const response = await fetch(
        `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ref: 'main' }),
        },
    );
    // Успех = 204 No Content.
    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`GitHub dispatch: ${response.status} ${text}`.trim());
    }
};
