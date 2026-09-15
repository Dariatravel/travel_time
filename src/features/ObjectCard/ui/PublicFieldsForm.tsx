'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FC } from 'react';

import { PUBLIC_FIELDS, type CardPublic, type PublicKey } from '../lib/objectCard';

/** Значения формы — строки: то, что набрано, а не то, что уйдёт в базу. */
export type PublicFormValues = Record<PublicKey, string>;

export const toFormValues = (card: CardPublic): PublicFormValues =>
    Object.fromEntries(
        PUBLIC_FIELDS.map((f) => {
            const v = card[f.key];

            return [f.key, Array.isArray(v) ? v.join(', ') : v === null || v === undefined ? '' : String(v)];
        }),
    ) as PublicFormValues;

/** Одна форма публичной части — и у менеджера, и у отельера. */
export const PublicFieldsForm: FC<{
    values: PublicFormValues;
    onChange: (values: PublicFormValues) => void;
    disabled?: boolean;
    /** Поля, которые отельер уже предложил изменить, — подсветить. */
    highlight?: Set<PublicKey>;
}> = ({ values, onChange, disabled, highlight }) => (
    <div className="grid gap-3 sm:grid-cols-2">
        {PUBLIC_FIELDS.map((field) => {
            const wide = field.kind === 'textarea';
            const set = (value: string) => onChange({ ...values, [field.key]: value });
            const marked = highlight?.has(field.key);

            return (
                <div key={field.key} className={wide ? 'sm:col-span-2' : ''}>
                    <Label className="text-xs text-muted-foreground">
                        {field.label}
                        {marked && <span className="ml-1 text-amber-700">· предложена правка</span>}
                    </Label>
                    {wide ? (
                        <Textarea
                            rows={4}
                            value={values[field.key]}
                            disabled={disabled}
                            onChange={(e) => set(e.target.value)}
                            className={marked ? 'border-amber-300' : ''}
                        />
                    ) : (
                        <Input
                            type={field.kind === 'number' ? 'number' : 'text'}
                            min={field.kind === 'number' ? 1 : undefined}
                            max={field.kind === 'number' ? 60 : undefined}
                            value={values[field.key]}
                            disabled={disabled}
                            placeholder={field.hint}
                            onChange={(e) => set(e.target.value)}
                            className={marked ? 'border-amber-300' : ''}
                        />
                    )}
                </div>
            );
        })}
    </div>
);
