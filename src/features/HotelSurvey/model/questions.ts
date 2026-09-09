/**
 * Вопросы опроса команды по объектам сайта (сентябрь 2026).
 * Список утверждён Дарьей 09.09.2026. Ответы хранятся по question.id,
 * подписи можно править свободно — id менять нельзя (сломает историю ответов).
 */
export type SurveyOption = { id: string; label: string };

export type SurveyQuestion = {
    id: string;
    title: string;
    /** single — одна кнопка; multi — несколько кнопок + необязательное поле «Другое». */
    type: 'single' | 'multi';
    options: SurveyOption[];
    /** Для multi: показывать поле свободного ввода «Другое». */
    allowOther?: boolean;
    /** Варианты, которые считаются проблемными в сводной статистике. */
    negative: string[];
};

export const SURVEY_QUESTIONS: SurveyQuestion[] = [
    {
        id: 'post_clarity',
        title: 'Хорошо ли понимается объект из поста?',
        type: 'single',
        options: [
            { id: 'yes', label: 'Да' },
            { id: 'not_really', label: 'Не особо' },
            { id: 'unclear', label: 'Вообще не понятен' },
        ],
        negative: ['not_really', 'unclear'],
    },
    {
        id: 'missing_media',
        title: 'Отметьте, каких фото/видео не хватает:',
        type: 'multi',
        options: [
            { id: 'rooms', label: 'Номера и категории' },
            { id: 'territory_kitchen', label: 'Территория и кухня' },
            { id: 'building', label: 'Общий вид здания, округа' },
            { id: 'beach_nearby', label: 'Пляж и что есть рядом (кафе и пр.)' },
        ],
        allowOther: true,
        negative: ['rooms', 'territory_kitchen', 'building', 'beach_nearby', 'other'],
    },
    {
        id: 'response_speed',
        title: 'Насколько оперативно отвечает отельер?',
        type: 'single',
        options: [
            { id: 'fast', label: 'Быстро' },
            { id: 'within_day', label: 'В течение дня' },
            { id: 'never', label: 'Не дождёшься ;(' },
        ],
        negative: ['never'],
    },
    {
        id: 'communication',
        title: 'В целом опыт общения с отельером:',
        type: 'single',
        options: [
            { id: 'good', label: 'Хороший!' },
            { id: 'so_so', label: 'Так-сяк' },
            { id: 'difficult', label: 'Тугой (вредный)' },
        ],
        negative: ['so_so', 'difficult'],
    },
];

/** Значение ответа, как оно лежит в jsonb-колонке answer. */
export type SurveyAnswerValue = { choice: string } | { choices: string[]; other?: string };

export const questionById = (id: string) => SURVEY_QUESTIONS.find((q) => q.id === id);

export const optionLabel = (question: SurveyQuestion, optionId: string) =>
    optionId === 'other'
        ? 'Другое'
        : (question.options.find((o) => o.id === optionId)?.label ?? optionId);

/** Ответ содержит хотя бы один «проблемный» вариант. */
export const isNegativeAnswer = (question: SurveyQuestion, value: SurveyAnswerValue): boolean => {
    if ('choice' in value) return question.negative.includes(value.choice);
    const chosen = [...(value.choices ?? []), ...(value.other?.trim() ? ['other'] : [])];
    return chosen.some((c) => question.negative.includes(c));
};
