import { RegisterProps } from '@/shared/api/auth/auth';
import { createStore } from 'effector';
import { createEffect } from 'effector/compat';

export type User = Omit<RegisterProps, 'password'>;
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
export const setUser = createEffect<User>();

export const $user = createStore<User | null>(
    null,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
).on(setUser, (old, newUser) => {
    return newUser;
});
