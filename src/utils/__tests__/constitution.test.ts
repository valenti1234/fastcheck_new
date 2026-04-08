import { applyConstitutionDate, normalizeIsoDate } from '../../utils/constitution';

describe('constitution utils', () => {
  it('normalizeIsoDate converts date string to YYYY-MM-DD', () => {
    expect(normalizeIsoDate('2012-03-15T10:00:00Z')).toBe('2012-03-15');
  });

  it('applyConstitutionDate sets fechaDeConstitucion from details', () => {
    const details = { dequienesLegalEvents: { constitution_date: '2012-03-15' } };
    const companyGeneralInfo: any = { fechaDeConstitucion: '' };
    applyConstitutionDate(details, companyGeneralInfo);
    expect(companyGeneralInfo.fechaDeConstitucion).toBe('2012-03-15');
  });

  it('applyConstitutionDate does not override existing fechaDeConstitucion', () => {
    const details = { dequienesLegalEvents: { constitution_date: '2012-03-15' } };
    const companyGeneralInfo: any = { fechaDeConstitucion: '2010-01-01' };
    applyConstitutionDate(details, companyGeneralInfo);
    expect(companyGeneralInfo.fechaDeConstitucion).toBe('2010-01-01');
  });
});

