export const normalizeIsoDate = (dateString: string) => {
  if (!dateString) return dateString as any;
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString as any;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
};

export const applyConstitutionDate = (details: any, companyGeneralInfo: any) => {
  if (!companyGeneralInfo) return;
  if (companyGeneralInfo.fechaDeConstitucion) return;
  const cdate = details?.dequienesLegalEvents?.constitution_date;
  if (typeof cdate === 'string' && cdate) {
    const normalized = normalizeIsoDate(cdate);
    if (normalized && /^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      companyGeneralInfo.fechaDeConstitucion = normalized;
    }
  }
};

