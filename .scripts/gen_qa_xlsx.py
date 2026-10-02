import re
from pathlib import Path
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

BASE = Path(__file__).resolve().parents[1]
MD = BASE / 'QA_TEST_LIST.md'
XLSX = BASE / 'QA_TEST_LIST.xlsx'

COL_COUNT = 10
HEADERS = [
    'ID', 'Caso de Prueba', 'Pasos', 'Resultado Esperado',
    'Criterio de Aceptación', 'Estado',
    'Tester', 'Data / Ora', 'Ambiente',
    'Note (Bug / Screenshot: link o path)'
]
WIDTHS = [10, 32, 55, 40, 55, 12, 16, 18, 14, 45]

FILL_HEADER = PatternFill('solid', fgColor='1F4E78')
FILL_ALT    = PatternFill('solid', fgColor='F2F2F2')
FILL_PEND   = PatternFill('solid', fgColor='E2EFDA')
WHITE_FILL  = PatternFill('solid', fgColor='FFFFFF')

thin = Side(border_style='thin', color='BFBFBF')
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)

FONT_HEADER = Font(bold=True, color='FFFFFF', size=11)
FONT_TITLE  = Font(bold=True, size=14, color='1F4E78')
FONT_SUB    = Font(bold=True, size=11, color='1F4E78')

ESTADOS = ['🟢 PENDIENTE', '🟡 EN CURSO', '✅ APROBADO', '❌ RECHAZADO', '⚠️ OBSERVADO']


def parse_md_tables(md_text: str):
    """Ritorna lista di sezioni: [ {'title':.. , 'level':# , 'table':[[...],...], 'pre_lines':[testo libre prima tabella]} ]
       Ogni table è list di righe (header è rows[0]), split per |.
       Ignora tabelle non-QA (Previa, Legenda: <10 colonne).
       Level = # di ## che comincia la sezione (1= modulo, 2=sottotitolo ...)
    """
    raw_lines = md_text.splitlines()
    # Rimuovi linee wrap soft (riga successiva senza | iniziale che è continuazione): non sono presenti adesso ma per sicurezza
    sections = []
    cur_title = None
    cur_level = 0
    cur_pre   = []
    cur_table = []
    in_table  = False
    section_has_table = False

    def flush():
        nonlocal cur_title, cur_level, cur_pre, cur_table, in_table, section_has_table
        if section_has_table:
            # Filtra tabelle con 10 colonne (QA vere)
            if cur_table:
                n_cols = len(cur_table[0])
            else:
                n_cols = 0
            # Se non ha almeno 10 colonne (tabella legenda/previa), la scartiamo come tabella
            if n_cols >= COL_COUNT:
                sections.append({
                    'title': cur_title or '(senza titolo)',
                    'level': cur_level,
                    'pre_lines': cur_pre,
                    'rows': cur_table,
                })
        cur_pre=[]; cur_table=[]; in_table=False; section_has_table=False

    for raw in raw_lines:
        line = raw.rstrip()
        # sezione
        m = re.match(r'^(#{1,4})\s+(.+?)\s*$', line)
        if m:
            flush()
            cur_level = len(m.group(1))
            cur_title = m.group(2).strip()
            continue
        if line.startswith('---') and not in_table:
            continue
        if line.startswith('|'):
            # togli | iniziale e finale
            inner = line.strip()
            if inner.startswith('|'): inner = inner[1:]
            if inner.endswith('|'):   inner = inner[:-1]
            cells = [c.strip() for c in inner.split('|')]
            # riga separatore solo '-'
            stripped_all = ''.join(cells).replace(' ','').replace('-','')
            if stripped_all == '' and '-' in ''.join(cells):
                continue  # salta separatore
            cur_table.append(cells)
            in_table = True
            section_has_table = True
        else:
            if in_table:
                pass  # la riga fuori tabella dopo tabella: è testo libero per prossima sezione ma non serve
            if line == '':
                pass
            else:
                cur_pre.append(line)
    flush()
    return sections


def write_instruction_sheet(wb: Workbook):
    ws = wb.active
    ws.title = 'Instrucciones'
    ws['A1'] = 'PLAN DE PRUEBAS QA — FRONTEND WEB'
    ws['A1'].font = Font(bold=True, size=16, color='1F4E78')
    ws.merge_cells('A1:J1')
    ws['A2'] = 'Duxiter Intermediate — Entorno Staging · Fecha inicio: 01/10/2026'
    ws.merge_cells('A2:J2')
    ws['A2'].font = Font(italic=True, color='595959')

    ws['A4'] = '🎯 Objetivo'
    ws['A4'].font = FONT_TITLE
    ws.merge_cells('A4:J4')
    ws['A5'] = ('Validar visualmente por el navegador TODAS las pantallas del menú lateral del portal web. '
                'NO hay que ejecutar scripts ni código: solo abrir la URL, entrar a cada menú, ejecutar los pasos de cada hoja y rellenar las columnas Estado / Tester / Data / Ambiente / Notas.')
    ws['A5'].alignment = Alignment(wrap_text=True, vertical='top')
    ws.merge_cells('A5:J5'); ws.row_dimensions[5].height = 42

    ws['A7'] = '📋 Convenciones de Estado'
    ws['A7'].font = FONT_TITLE
    ws.merge_cells('A7:J7')
    ws['A8'] = 'Estado'; ws['B8'] = 'Significado'
    ws['A8'].font=FONT_HEADER; ws['B8'].font=FONT_HEADER
    ws['A8'].fill=FILL_HEADER; ws['B8'].fill=FILL_HEADER
    ws['A8'].alignment=Alignment(horizontal='center'); ws['B8'].alignment=Alignment(horizontal='center')
    rows_est = [
        ('🟢 PENDIENTE', 'Caso de prueba por ejecutar (valor POR DEFECTO)'),
        ('🟡 EN CURSO',   'Ejecución en progreso / repetir tras un fix'),
        ('✅ APROBADO',   'Cumple LOS CRITERIOS DE ACEPTACIÓN de la columna E'),
        ('❌ RECHAZADO',  'No cumple; informar con pasos + captura en columna J'),
        ('⚠️ OBSERVADO',  'Desviación menor, NO bloqueante para entrega'),
    ]
    for i,(e,s) in enumerate(rows_est, start=9):
        ws.cell(i,1,e); ws.cell(i,2,s)
        ws.cell(i,1).alignment = Alignment(vertical='top')
        ws.cell(i,2).alignment = Alignment(wrap_text=True, vertical='top')
        ws.cell(i,1).border = BORDER; ws.cell(i,2).border = BORDER
        ws.row_dimensions[i].height = 22

    ws['A16'] = '🧭 Instrucciones para rellenar (muy importante)'
    ws['A16'].font = FONT_TITLE
    ws.merge_cells('A16:J16')
    pasos = [
        '1. Ve a la pestaña/hoja del MÓDULO que quieres probar (pestañas abajo: Mod1 Consultas, Mod2 RUT, etc.).',
        '2. Cada fila = 1 caso de prueba. Ejecuta LOS PASOS exactamente descritos en la columna C.',
        '3. Compara lo que pasa con el RESULTADO ESPERADO (col D) y el CRITERIO DE ACEPTACIÓN (col E).',
        '4. Rellena la columna ESTADO (F): usa el menú DESPLEGABLE (flecha) — se valida que solo elijas uno de los 5 emojis.',
        '5. Rellena G (Tester: quién lo ha probado), H (Fecha / Ora), I (Ambiente: Staging / Producción / Localhost).',
        '6. Solo si el caso es ❌ RECHAZADO o ⚠️ OBSERVADO: rellena la columna J con (a) descripción breve del bug, (b) ruta o link al screenshot.',
        '7. Al finalizar la sesión, marca el ✔ Checklist Global (última hoja: "Checklist Global").',
    ]
    for i,p in enumerate(pasos, start=17):
        ws.cell(i,1,p)
        ws.merge_cells(start_row=i, start_column=1, end_row=i, end_column=10)
        ws.cell(i,1).alignment = Alignment(wrap_text=True, vertical='top')
        ws.row_dimensions[i].height = 26

    # Larghezza col nella foglio istruzioni
    ws.column_dimensions['A'].width=14
    for c in range(2,11): ws.column_dimensions[get_column_letter(c)].width=28
    ws.freeze_panes = 'A4'


def sheet_safe_name(name: str, existing: set) -> str:
    """Excel max 31 chars, unici, no []:*?/\\"""
    bad = set('[]:*?/\\')
    clean = ''.join('_' if c in bad else c for c in name)[:28]
    base = clean
    i=2
    while clean in existing:
        suffix = f'_{i}'
        clean = (base[:28-len(suffix)]) + suffix
        i+=1
    existing.add(clean)
    return clean


def write_table_sheet(wb: Workbook, section, existing_names, dv_estado):
    title = section['title']
    ws = wb.create_sheet(title=sheet_safe_name(title, existing_names))
    # title line
    ws.cell(row=1, column=1, value=title).font = FONT_TITLE
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=COL_COUNT)
    ws.row_dimensions[1].height = 24

    # intestazione tabella (row 2)
    for ci, h in enumerate(HEADERS, start=1):
        c = ws.cell(row=2, column=ci, value=h)
        c.font = FONT_HEADER
        c.fill = FILL_HEADER
        c.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        c.border = BORDER
    ws.row_dimensions[2].height = 30

    # dati — SKIP: se la prima riga è un altro header (inizia con ID/Caso), scartalo
    rows = list(section['rows'])
    if rows and (rows[0][0].strip() == 'ID' and len(rows[0]) >= 2 and 'Caso' in rows[0][1]):
        rows = rows[1:]

    for ri, row in enumerate(rows, start=3):
        if len(row) < COL_COUNT:
            # riempi con vuoto le mancanti
            row = list(row) + ['']*(COL_COUNT - len(row))
        # tronca a 10 colonne
        row = row[:COL_COUNT]
        # se la colonna Stato è solo l'emoji senza testo, completala con default
        stato_raw = row[5].strip()
        if stato_raw in ('🟢','🟡','✅','❌','⚠️'):
            mapping = {'🟢':'🟢 PENDIENTE','🟡':'🟡 EN CURSO','✅':'✅ APROBADO','❌':'❌ RECHAZADO','⚠️':'⚠️ OBSERVADO'}
            row[5] = mapping[stato_raw]
        elif stato_raw == '':
            row[5] = '🟢 PENDIENTE'
        for ci, val in enumerate(row, start=1):
            c = ws.cell(row=ri, column=ci, value=val)
            c.alignment = Alignment(vertical='top', wrap_text=True)
            c.border = BORDER
            if (ri-3) % 2 == 1:
                c.fill = FILL_ALT
            # centrare colonne ID, Stato, Tester?, Data, Ambiente
            if ci in (1,6,7,8,9):
                c.alignment = Alignment(horizontal='center', vertical='top', wrap_text=True)
        # data validation: colonna Stato
        ws.cell(row=ri, column=6).value = row[5]  # rewrites with mapping if any

    # applica validazione a tutte le righe dei dati in colonna F
    if len(rows) >= 1:
        end_row = 2 + len(rows)
        ws.add_data_validation(dv_estado)
        dv_estado.add(f'F3:F{end_row}')

    # larghezze
    for ci, w in enumerate(WIDTHS, start=1):
        ws.column_dimensions[get_column_letter(ci)].width = w
    # altezza default righe dati
    for ri in range(3, 3 + len(rows) + 5):
        ws.row_dimensions[ri].height = 36

    ws.freeze_panes = 'A3'
    # auto filtro header
    end_row = 2 + max(len(rows),1)
    ws.auto_filter.ref = f'A2:J{end_row}'


def write_global_checklist(wb: Workbook, existing_names):
    ws = wb.create_sheet(title=sheet_safe_name('✔ Checklist Global', existing_names))
    items = [
        ('✅', 'No hay pantallas blancas ni bloqueos permanentes en NINGUNA de las páginas visitadas.'),
        ('✅', 'Consola del navegador (F12) SIN ERRORES EN ROJO durante los flujos felices. Warnings amarillos = OK.'),
        ('✅', 'Ninguna evaluación se envía dos veces (sin doble click fantasma que consuma créditos dobles).'),
        ('✅', 'Botones de descarga (Excel / MD / PDF) producen archivos ABRIBLES y con contenido coherente.'),
        ('⚡', 'FIXES PRIORITARIOS (comprobar obligatoriamente):'),
        ('   ⚡', '1) Escribir RUT de 2 dígitos → SIN guion (no debe aparecer 12-9)'),
        ('   ⚡', '2) Borrar último dígito en RUT VERDE → NO lo reinserta automáticamente'),
        ('   ⚡', '3) Empresa PRINCIPAL NO aparece dos veces en Socios Históricos'),
        ('   ⚡', '4) Históricos: banderas Listas Propias y colores semáforo NO se recalculan al abrir'),
        ('🧭', 'Navegación general: TODO el menú izquierdo se abre sin errores 404 (Dashboard, Evaluación Individual/Masiva, Consultas, Historial, Usuarios, Configuración, Listas Propias, Ayuda, Deep Check).'),
    ]
    ws.cell(1,1,'✔ CHECKLIST GLOBAL DE ACEPTACIÓN').font = FONT_TITLE
    ws.merge_cells('A1:E1')
    ws.cell(2,1,'Marcar X en columna B cuando se haya comprobado').font = Font(italic=True, color='595959')
    ws.merge_cells('A2:E2')
    headers_c = ['✓','Item','Tester','Fecha / Hora','Observaciones']
    for ci,h in enumerate(headers_c, start=1):
        c=ws.cell(4,ci,h); c.font=FONT_HEADER; c.fill=FILL_HEADER
        c.alignment=Alignment(horizontal='center', vertical='center'); c.border=BORDER
    widths_c = [8, 90, 18, 20, 40]
    for ci,w in enumerate(widths_c,start=1):
        ws.column_dimensions[get_column_letter(ci)].width = w
    dv_si_no = DataValidation(type='list', formula1='"X,-"', allow_blank=True)
    ws.add_data_validation(dv_si_no)
    for ri,(flag, txt) in enumerate(items, start=5):
        cflag = ws.cell(ri,1,flag)
        cflag.alignment = Alignment(horizontal='center')
        cflag.font = Font(bold=(flag in ('✅','⚡')))
        ctxt = ws.cell(ri,2,txt)
        ctxt.alignment = Alignment(wrap_text=True, vertical='top')
        c_tst  = ws.cell(ri,3)
        c_date = ws.cell(ri,4)
        c_note = ws.cell(ri,5)
        c_note.alignment = Alignment(wrap_text=True, vertical='top')
        c_check = ws.cell(ri,1)
        if flag in ('✅','   ⚡','🧭'):
            # replace checkmark con empty per dropdown
            ws.cell(ri,1,'')
            dv_si_no.add(f'A{ri}')
        for col in (1,2,3,4,5):
            ws.cell(ri,col).border = BORDER
        ws.row_dimensions[ri].height = 24
    ws.freeze_panes = 'A5'


def main():
    md_text = MD.read_text(encoding='utf-8')
    sections = parse_md_tables(md_text)
    wb = Workbook()
    existing_names = set()

    # Instrucciones
    write_instruction_sheet(wb)
    existing_names.add(wb.active.title)

    # data val Estado (ripetibile per ogni foglio)
    dv_estado = DataValidation(type='list',
                               formula1='"'+','.join(ESTADOS)+'"',
                               allow_blank=True,
                               showDropDown=False)
    dv_estado.error = 'Scegli uno dei 5 valori dal menù a tendina'
    dv_estado.errorTitle = 'Stato non valido'
    dv_estado.prompt = 'Seleziona dalla lista: 🟢 🟡 ✅ ❌ ⚠️'
    dv_estado.promptTitle = 'Stato del caso di prova'

    for sec in sections:
        # creo un dv clone per ogni foglio perché openpyxl non vuole 1 DV in più fogli
        dv_estado_clone = DataValidation(type='list',
                               formula1='"'+','.join(ESTADOS)+'"',
                               allow_blank=True, showDropDown=False)
        dv_estado_clone.error='Usa la lista'
        dv_estado_clone.prompt='Scegli uno stato'
        write_table_sheet(wb, sec, existing_names, dv_estado_clone)

    # Checklist global
    write_global_checklist(wb, existing_names)

    wb.save(XLSX)
    total = sum(len(s['rows']) for s in sections)
    print(f"✅ GENERATO: {XLSX}")
    print(f"   Numero sezioni (fogli QA)  : {len(sections)}")
    print(f"   Nomi fogli:")
    for s in sections:
        print(f"     · {s['title']}  ({len(s['rows'])} casi)")
    print(f"   Tot. casi di test compilabili: {total}")
    print(f"   File size: {XLSX.stat().st_size/1024:.1f} KB")


if __name__ == '__main__':
    main()
