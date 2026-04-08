import { deriveRelations, DequienesRelationshipsData } from '../../utils/dequienes';

describe('deriveRelations', () => {
  const sampleData: DequienesRelationshipsData = {
    relationships: [
      { source: '76595712', target: '12931410', label: 'REPRESENTED_BY' },
      { source: '76595712', target: '12931410', label: 'OWNED_BY' },
      { source: '76595712', target: '76074901', label: 'OWNED_BY' },
      { source: '77084498', target: '12931410', label: 'REPRESENTED_BY' },
      { source: '76737430', target: '12931410', label: 'OWNED_BY' },
    ],
    entityNames: {
      '12931410': 'OLIVER RODRIGO ZAMPEZE ASEM',
      '76074901': 'SOCIEDAD COMERCIAL ZAMPEZE LIMITADA',
      '76595712': 'FORZA CHILE SPA EN LIQUIDACION',
    },
  };

  it('filters by source company RUT and maps labels to socios/representantes', () => {
    const { socios, representantes } = deriveRelations(sampleData, '76.595.712-5');

    expect(representantes).toEqual([
      { name: 'OLIVER RODRIGO ZAMPEZE ASEM', rut: '12931410' },
    ]);

    expect(socios).toEqual([
      { name: 'OLIVER RODRIGO ZAMPEZE ASEM', rut: '12931410' },
      { name: 'SOCIEDAD COMERCIAL ZAMPEZE LIMITADA', rut: '76074901' },
    ]);
  });

  it('returns empty arrays when relData or companyRut is missing', () => {
    expect(deriveRelations(null, '76.595.712-5')).toEqual({ socios: [], representantes: [] });
    expect(deriveRelations(sampleData, null as unknown as string)).toEqual({ socios: [], representantes: [] });
  });

  it('uses target as fallback name when entityNames missing', () => {
    const minimal: DequienesRelationshipsData = {
      relationships: [{ source: '76595712', target: '12345678', label: 'OWNED_BY' }],
      entityNames: {},
    };
    const { socios } = deriveRelations(minimal, '76595712-0');
    expect(socios).toEqual([{ name: '12345678', rut: '12345678' }]);
  });
});

