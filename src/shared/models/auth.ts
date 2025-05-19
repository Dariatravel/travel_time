import { RegisterProps } from '@/shared/api/auth/auth';
import { createStore } from 'effector';
import { createEffect } from 'effector/compat';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
export const setUser = createEffect<Omit<RegisterProps, 'password'>>();

export const $user = createStore<Omit<RegisterProps, 'password'> | null>(
    null,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
).on(setUser, (old, newUser) => {
    return newUser;
});
