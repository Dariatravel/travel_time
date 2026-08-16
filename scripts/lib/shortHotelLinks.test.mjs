import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aliasHtml, aliasTargetFromHtml, buildShortSlug, isShortCatalogPath } from './shortHotelLinks.mjs';

describe('короткие ссылки объектов', () => {
    it('транслитерирует название и убирает тип объекта', () => {
        assert.equal(buildShortSlug('«БЛЭК СИ» отель с бассейном'), 'blek-si');
        assert.equal(buildShortSlug('Грасс гостевой дом'), 'grass');
        assert.equal(buildShortSlug('БИОСФЕРА домики у Кындыгского источника'), 'biosfera');
        assert.equal(buildShortSlug('ТРИО номер на пляже'), 'trio');
        assert.equal(buildShortSlug('ИНКИТ РЕЗОРТ афреймы'), 'inkit-rezort');
    });

    it('сохраняет цифры, являющиеся частью названия', () => {
        assert.equal(buildShortSlug('Пляжный комплекс 151'), 'plyazhnyy-151');
    });

    it('отличает короткий адрес от длинного адреса карточки', () => {
        assert.equal(isShortCatalogPath('/hotels/blek-si/'), true);
        assert.equal(isShortCatalogPath('/hotels/blek-si-3912/'), false);
    });

    it('создаёт проверяемую страницу-псевдоним', () => {
        const html = aliasHtml('hotels/blek-si-otel-s-basseynom-i-pitaniem-3912/');
        assert.equal(aliasTargetFromHtml(html), 'hotels/blek-si-otel-s-basseynom-i-pitaniem-3912/');
        assert.match(html, /name="robots" content="noindex"/);
    });
});
