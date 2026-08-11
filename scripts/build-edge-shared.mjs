import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const statusSourcePath = path.join(
    root,
    'src/features/Reservation/lib/chessmateHotelHeaderStatus.ts',
);
const citiesSourcePath = path.join(root, 'src/features/AdvancedFilters/lib/constants.ts');
const outputPath = path.join(root, 'supabase/functions/telegram-bot/_shared/chessmate.ts');

const parseSource = (filePath) =>
    ts.createSourceFile(
        filePath,
        fs.readFileSync(filePath, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
    );

const getVariableInitializer = (sourceFile, variableName) => {
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

    throw new Error(`Не найдена константа ${variableName}`);
};

const getString = (node, context) => {
    if (ts.isStringLiteralLike(node)) return node.text;

    throw new Error(`${context}: ожидалась строка`);
};

const getPropertyName = (node, context) => {
    if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text;

    throw new Error(`${context}: неподдерживаемое имя свойства`);
};

const statusSource = parseSource(statusSourcePath);
const mirrorInitializer = getVariableInitializer(statusSource, 'MIRROR_HOTEL_TITLES');

if (!ts.isNewExpression(mirrorInitializer) || !mirrorInitializer.arguments?.length) {
    throw new Error('MIRROR_HOTEL_TITLES должен создаваться через new Set([...])');
}

const mirrorArray = mirrorInitializer.arguments[0];
if (!ts.isArrayLiteralExpression(mirrorArray)) {
    throw new Error('MIRROR_HOTEL_TITLES должен содержать массив строк');
}

const mirrorTitles = mirrorArray.elements.map((element, index) =>
    getString(element, `MIRROR_HOTEL_TITLES[${index}]`),
);

const statusInitializer = getVariableInitializer(statusSource, 'CHESSMATE_STATUS_BY_HOTEL_TITLE');
if (!ts.isObjectLiteralExpression(statusInitializer)) {
    throw new Error('CHESSMATE_STATUS_BY_HOTEL_TITLE должен быть объектом');
}

const statuses = statusInitializer.properties.map((property, index) => {
    if (!ts.isPropertyAssignment(property)) {
        throw new Error(`CHESSMATE_STATUS_BY_HOTEL_TITLE[${index}]: ожидалось свойство`);
    }

    return [
        getPropertyName(property.name, `CHESSMATE_STATUS_BY_HOTEL_TITLE[${index}]`),
        getString(property.initializer, `CHESSMATE_STATUS_BY_HOTEL_TITLE[${index}]`),
    ];
});

const citiesSource = parseSource(citiesSourcePath);
const citiesInitializer = getVariableInitializer(citiesSource, 'DEFAULT_CITIES');
if (!ts.isArrayLiteralExpression(citiesInitializer)) {
    throw new Error('DEFAULT_CITIES должен быть массивом');
}

const cities = citiesInitializer.elements.map((element, index) => {
    if (!ts.isObjectLiteralExpression(element)) {
        throw new Error(`DEFAULT_CITIES[${index}]: ожидался объект`);
    }

    const values = new Map();
    for (const property of element.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        values.set(
            getPropertyName(property.name, `DEFAULT_CITIES[${index}]`),
            property.initializer,
        );
    }

    return {
        value: getString(values.get('value'), `DEFAULT_CITIES[${index}].value`),
        label: getString(values.get('label'), `DEFAULT_CITIES[${index}].label`),
    };
});

const quoted = (value) => JSON.stringify(value);
const lines = [
    '// Этот файл сгенерирован scripts/build-edge-shared.mjs.',
    '// Изменяйте исходные константы приложения и запускайте генератор.',
    '',
    "export type ChessmateHotelHeaderStatus = 'active' | 'mirror' | 'access' | 'request';",
    '',
    'export const DEFAULT_CITIES = [',
    ...cities.map((city) => `    { value: ${quoted(city.value)}, label: ${quoted(city.label)} },`),
    '] as const;',
    '',
    'const MIRROR_HOTEL_TITLES = new Set<string>([',
    ...mirrorTitles.map((title) => `    ${quoted(title)},`),
    ']);',
    '',
    'const CHESSMATE_STATUS_BY_HOTEL_TITLE: Record<string, ChessmateHotelHeaderStatus> = {',
    ...statuses.map(([title, status]) => `    ${quoted(title)}: ${quoted(status)},`),
    '};',
    '',
    'const normalizeHotelTitle = (title: string) =>',
    '    title',
    '        .toLowerCase()',
    "        .replaceAll('ё', 'е')",
    "        .replace(/[“”\"«»()\\-.,]/g, ' ')",
    "        .replace(/\\s+/g, ' ')",
    '        .trim();',
    '',
    'export const getChessmateHotelHeaderStatus = (',
    '    title?: string | null,',
    '): ChessmateHotelHeaderStatus | undefined => {',
    '    if (!title) return undefined;',
    '',
    '    const normalizedTitle = normalizeHotelTitle(title);',
    '',
    "    if (MIRROR_HOTEL_TITLES.has(normalizedTitle)) return 'mirror';",
    '',
    '    return CHESSMATE_STATUS_BY_HOTEL_TITLE[normalizedTitle];',
    '};',
    '',
];

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, lines.join('\n'));

console.log(`Сгенерирован ${path.relative(root, outputPath)}`);
