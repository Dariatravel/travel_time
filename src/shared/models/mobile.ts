import { createEvent, createStore } from 'effector';

export const setIsMobile = createEvent<boolean>();

export const $isMobile = createStore<boolean>(false);

$isMobile.on(setIsMobile, (_, isMobile) => isMobile);
