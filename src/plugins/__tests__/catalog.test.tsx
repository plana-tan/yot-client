import { catalog, resolveComponent } from '@/plugins/catalog';

describe('catalog', () => {
  it('resolves every spec type', () => {
    for (const t of ['Row', 'Column', 'Scroll', 'Spacer', 'Divider', 'Title', 'Subtitle', 'Text', 'TimeLabel', 'Badge', 'ProgressBar', 'Checkbox', 'Card', 'CardHeader', 'CardTitle', 'CardContent', 'Button', 'Progress', 'Separator', 'ListRow', 'SectionLabel', 'Route']) {
      expect(catalog[t]).toBeDefined();
    }
  });
  it('throws on unknown type', () => {
    expect(() => resolveComponent('Nope')).toThrow(/Unknown catalog component/);
  });
});
