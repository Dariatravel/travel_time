// Цвет шахматки по названию отеля — для скриптов-отчётов.
//
// Единственный источник правды остаётся прежним: TS-файл приложения
// (src/features/Reservation/lib/chessmateHotelHeaderStatus.ts). Здесь он
// читается тем же разбором TypeScript, что и в build-edge-shared.mjs, поэтому
// подключение отеля к автосинку правится по-прежнему в одном месте.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourcePath = path.join(root, 'src/features/Reservation/lib/chessmateHotelHeaderStatus.ts');

const getInitializer = (sourceFile, variableName) => {
    for (const statement of sourceFile.statements) {
        if (!ts.isVariableStatement(statement)) continue;

        for (const declaration of statement.declarationList.declarations) {
            if (
                ts.isIdentifier(declaration.name) &&
                declaration.name.text === variableName &&
                declaration.initializer
            ) {
                return declaration.initializer;
            }
        }
    }

    throw new Error(`Не найдена константа ${variableName} в ${sourcePath}`);
};

const readLists = () => {
    const sourceFile = ts.createSourceFile(
        sourcePath,
        fs.readFileSync(sourcePath, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
    );

    // new Set<string>([...]) — берём строки из массива-аргумента.
    const mirrorInit = getInitializer(sourceFile, 'MIRROR_HOTEL_TITLES');
    const mirrorArray = ts.isNewExpression(mirrorInit) ? mirrorInit.arguments?.[0] : mirrorInit;
    if (!mirrorArray || !ts.isArrayLiteralExpression(mirrorArray)) {
        throw new Error('MIRROR_HOTEL_TITLES: ожидался массив строк');
    }

    const mirror = new Set(
        mirrorArray.elements
            .filter((element) => ts.isStringLiteralLike(element))
            .map((element) => element.text),
    );

    const statusInit = getInitializer(sourceFile, 'CHESSMATE_STATUS_BY_HOTEL_TITLE');
    if (!ts.isObjectLiteralExpression(statusInit)) {
        throw new Error('CHESSMATE_STATUS_BY_HOTEL_TITLE: ожидался объект');
    }

    const byTitle = new Map();
    for (const property of statusInit.properties) {
        if (!ts.isPropertyAssignment(property)) continue;

        const name = property.name;
        const title = ts.isStringLiteralLike(name)
            ? name.text
            : ts.isIdentifier(name)
              ? name.text
              : null;

        if (title && ts.isStringLiteralLike(property.initializer)) {
            byTitle.set(title, property.initializer.text);
        }
    }

    return { mirror, byTitle };
};

const { mirror, byTitle } = readLists();

/** Та же нормализация, что в приложении. */
export const normalizeHotelTitle = (title) =>
    (title ?? '')
        .toLowerCase()
        .replaceAll('ё', 'е')
        .replace(/[“”"«»()\-.,]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

/** 'active' | 'mirror' | 'access' | 'request' | undefined */
export const getChessmateStatus = (title) => {
    const normalized = normalizeHotelTitle(title);

    // Голубые (автосинк) — приоритетнее прочих статусов, как в приложении.
    if (mirror.has(normalized)) return 'mirror';

    return byTitle.get(normalized);
};

/** Актуальная занятость: зелёные (ведёт человек) и голубые (автосинк). */
export const isMaintainedStatus = (status) => status === 'active' || status === 'mirror';
