from __future__ import annotations

from datetime import date
from pathlib import Path
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "documentacion" / "Manual_Tecnico_Sistema_Congreso_UTVM.docx"


def x(text: object) -> str:
    return escape(str(text))


class Docx:
    def __init__(self) -> None:
        self.body: list[str] = []

    def p(self, text: str = "", style: str | None = None, *, bold: bool = False,
          italic: bool = False, align: str | None = None, keep: bool = False) -> None:
        ppr = []
        if style:
            ppr.append(f'<w:pStyle w:val="{x(style)}"/>')
        if align:
            ppr.append(f'<w:jc w:val="{x(align)}"/>')
        if keep:
            ppr.append('<w:keepNext/>')
        rpr = []
        if bold:
            rpr.append('<w:b/>')
        if italic:
            rpr.append('<w:i/>')
        preserve = ' xml:space="preserve"' if text.startswith(" ") or text.endswith(" ") else ""
        self.body.append(
            f'<w:p><w:pPr>{"".join(ppr)}</w:pPr><w:r><w:rPr>{"".join(rpr)}</w:rPr>'
            f'<w:t{preserve}>{x(text)}</w:t></w:r></w:p>'
        )

    def heading(self, text: str, level: int = 1) -> None:
        self.p(text, f"Heading{level}", keep=True)

    def bullet(self, text: str, level: int = 0) -> None:
        self.body.append(
            f'<w:p><w:pPr><w:pStyle w:val="ListBullet"/><w:numPr><w:ilvl w:val="{level}"/>'
            f'<w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>{x(text)}</w:t></w:r></w:p>'
        )

    def code(self, text: str) -> None:
        for line in text.splitlines() or [""]:
            self.body.append(
                '<w:p><w:pPr><w:pStyle w:val="Code"/></w:pPr><w:r><w:rPr><w:rFonts '
                'w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="18"/></w:rPr>'
                f'<w:t xml:space="preserve">{x(line)}</w:t></w:r></w:p>'
            )

    def table(self, headers: list[str], rows: list[list[object]], widths: list[int] | None = None) -> None:
        widths = widths or [int(9000 / len(headers))] * len(headers)
        out = ['<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/>'
               '<w:tblLook w:val="04A0"/></w:tblPr><w:tblGrid>']
        out.extend(f'<w:gridCol w:w="{w}"/>' for w in widths)
        out.append('</w:tblGrid>')
        for ridx, row in enumerate([headers] + rows):
            out.append('<w:tr>')
            for cidx, cell in enumerate(row):
                shade = '<w:shd w:fill="1F4E78"/>' if ridx == 0 else ('<w:shd w:fill="D9EAF7"/>' if ridx % 2 == 0 else '')
                color = '<w:color w:val="FFFFFF"/>' if ridx == 0 else ''
                bold = '<w:b/>' if ridx == 0 else ''
                out.append(
                    f'<w:tc><w:tcPr><w:tcW w:w="{widths[cidx]}" w:type="dxa"/>{shade}'
                    f'<w:vAlign w:val="center"/></w:tcPr><w:p><w:r><w:rPr>{bold}{color}</w:rPr>'
                    f'<w:t>{x(cell)}</w:t></w:r></w:p></w:tc>'
                )
            out.append('</w:tr>')
        out.append('</w:tbl>')
        self.body.append(''.join(out))
        self.p()

    def page_break(self) -> None:
        self.body.append('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')

    def toc(self) -> None:
        self.body.append(
            '<w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>'
            '<w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r>'
            '<w:r><w:fldChar w:fldCharType="separate"/></w:r>'
            '<w:r><w:t>Actualice este campo en Word para generar el índice automático.</w:t></w:r>'
            '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>'
        )

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        document = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>{''.join(self.body)}
<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708"/>
<w:headerReference w:type="default" r:id="rId1"/><w:footerReference w:type="default" r:id="rId2"/></w:sectPr>
</w:body></w:document>'''
        styles = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="22"/><w:lang w:val="es-MX"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Subtitle"/><w:qFormat/><w:pPr><w:spacing w:before="600" w:after="240"/><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:color w:val="1F4E78"/><w:sz w:val="42"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr><w:rPr><w:color w:val="666666"/><w:sz w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:outlineLvl w:val="0"/><w:pPr><w:keepNext/><w:pageBreakBefore/><w:spacing w:before="240" w:after="160"/></w:pPr><w:rPr><w:b/><w:color w:val="1F4E78"/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:outlineLvl w:val="1"/><w:pPr><w:keepNext/><w:spacing w:before="220" w:after="120"/></w:pPr><w:rPr><w:b/><w:color w:val="2F75B5"/><w:sz w:val="27"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:outlineLvl w:val="2"/><w:pPr><w:keepNext/><w:spacing w:before="180" w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="3F6F8F"/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:fill="F2F2F2"/><w:ind w:left="360" w:right="360"/><w:spacing w:before="40" w:after="40"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="18"/></w:rPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="B7B7B7"/><w:left w:val="single" w:sz="4" w:color="B7B7B7"/><w:bottom w:val="single" w:sz="4" w:color="B7B7B7"/><w:right w:val="single" w:sz="4" w:color="B7B7B7"/><w:insideH w:val="single" w:sz="4" w:color="B7B7B7"/><w:insideV w:val="single" w:sz="4" w:color="B7B7B7"/></w:tblBorders><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>'''
        numbering = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="multilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="720"/></w:tabs><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>'''
        header = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="right"/><w:pBdr><w:bottom w:val="single" w:sz="4" w:color="1F4E78"/></w:pBdr></w:pPr><w:r><w:rPr><w:color w:val="666666"/><w:sz w:val="18"/></w:rPr><w:t>Manual técnico · Sistema Congreso UTVM</w:t></w:r></w:p></w:hdr>'''
        footer = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>Página </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>'''
        content_types = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>'''
        root_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>'''
        doc_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>'''
        core = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Manual Técnico del Sistema Congreso UTVM</dc:title><dc:subject>Backend y frontend</dc:subject><dc:creator>Equipo del Sistema Congreso UTVM</dc:creator><cp:lastModifiedBy>Codex</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">{date.today().isoformat()}T00:00:00Z</dcterms:created></cp:coreProperties>'''
        app = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft Office Word</Application><DocSecurity>0</DocSecurity><AppVersion>16.0000</AppVersion></Properties>'''
        with ZipFile(path, "w", ZIP_DEFLATED) as z:
            for name, data in {
                "[Content_Types].xml": content_types, "_rels/.rels": root_rels,
                "word/document.xml": document, "word/styles.xml": styles,
                "word/numbering.xml": numbering, "word/header1.xml": header,
                "word/footer1.xml": footer, "word/_rels/document.xml.rels": doc_rels,
                "docProps/core.xml": core, "docProps/app.xml": app,
            }.items():
                z.writestr(name, data.encode("utf-8"))


def build() -> Docx:
    d = Docx()
    d.p("UNIVERSIDAD TECNOLÓGICA DEL VALLE DEL MEZQUITAL", bold=True, align="center")
    d.p("MANUAL TÉCNICO", "Title")
    d.p("Sistema de Gestión del Congreso UTVM", "Subtitle")
    d.p("Backend y frontend", "Subtitle")
    d.p("Versión documental 1.0", align="center")
    d.p(f"Fecha de elaboración: {date.today().strftime('%d/%m/%Y')}", align="center")
    d.p("Base técnica revisada: rama main, commit 1cd271a", align="center")
    d.p()
    d.p("Documento para revisión interna. Esta versión es editable y será convertida a PDF después de su aprobación.", italic=True, align="center")
    d.page_break()
    d.heading("Control del documento", 1)
    d.table(["Campo", "Valor"], [
        ["Documento", "Manual Técnico del Sistema Congreso UTVM"],
        ["Versión", "1.0"], ["Alcance", "Backend, frontend, persistencia, integraciones y operación"],
        ["Repositorio", "Pagina-Congreso-UTVM"], ["Rama/commit revisado", "main / 1cd271a"],
        ["Estado", "Borrador para validación"], ["Audiencia", "Desarrollo, soporte, infraestructura y responsables técnicos"],
    ], [2600, 6400])
    d.heading("Historial de cambios", 2)
    d.table(["Versión", "Fecha", "Descripción"], [["1.0", date.today().strftime('%d/%m/%Y'), "Primera edición general basada en el código vigente."]], [1300, 1800, 5900])
    d.heading("Índice", 1)
    d.toc()

    d.heading("1. Introducción", 1)
    d.p("Este manual describe la estructura técnica, configuración, operación y mantenimiento del Sistema de Gestión del Congreso UTVM. El sistema centraliza el registro de participantes, la administración del programa académico, el contenido público, las inscripciones a talleres, el acceso mediante códigos QR y la emisión de reconocimientos.")
    d.heading("1.1 Objetivo", 2)
    d.p("Proporcionar una referencia reproducible para instalar, comprender, ejecutar, probar, desplegar y mantener la solución, así como identificar sus dependencias y los puntos que requieren endurecimiento antes de un ambiente productivo.")
    d.heading("1.2 Alcance funcional", 2)
    for item in [
        "Registro y administración de participantes UTVM, EMS, NSU y externos.",
        "Validación de correo y estado de pago para ciertos tipos de participante.",
        "Gestión de congresos, días de evento, ubicaciones, ponentes, panelistas, conferencias, talleres y foros empresariales.",
        "Carga y consulta de imágenes y comprobantes mediante Supabase Storage.",
        "Emisión, envío por correo y validación presencial de accesos QR.",
        "Inscripción a talleres con control de capacidad.",
        "Administración de banners, noticias, secciones y página oficial.",
        "Preparación y descarga de reconocimientos en PDF.",
    ]: d.bullet(item)

    d.heading("2. Visión general de la solución", 1)
    d.heading("2.1 Arquitectura lógica", 2)
    d.code("Navegador\n   │ HTTP/JSON + archivos multipart\n   ▼\nFrontend Vue 3 + Quasar (puerto 9000 en desarrollo)\n   │ Axios: VITE_API_URL\n   ▼\nAPI REST NestJS (prefijo /api, puerto 3000 por defecto)\n   ├── TypeORM ── PostgreSQL 16\n   ├── Supabase Storage ── imágenes y comprobantes\n   ├── SMTP/Nodemailer ── correo y QR\n   └── PDF-lib + QRCode ── reconocimientos y códigos QR")
    d.p("El repositorio se organiza como un workspace pnpm. El backend y el frontend son aplicaciones independientes que comparten comandos de ejecución desde la raíz.")
    d.heading("2.2 Tecnologías", 2)
    d.table(["Capa", "Tecnologías principales", "Responsabilidad"], [
        ["Frontend", "Vue 3, Quasar 2, TypeScript, Vite, Vue Router", "Interfaz pública y administrativa"],
        ["Estado/datos cliente", "Pinia, TanStack Vue Query, Axios", "Estado local, caché y consumo de API"],
        ["Backend", "NestJS 11, TypeScript, RxJS", "API REST, reglas de negocio e integraciones"],
        ["Persistencia", "TypeORM, PostgreSQL 16", "Entidades relacionales y transacciones"],
        ["Archivos", "Supabase JS / Storage", "Imágenes y comprobantes"],
        ["Mensajería", "Nodemailer, Handlebars", "Correo transaccional con plantillas"],
        ["Documentos", "pdf-lib, fontkit, qrcode", "Reconocimientos PDF y QR"],
        ["Calidad", "Jest, ESLint, Prettier, Oxlint, Oxfmt, vue-tsc", "Pruebas, estilo y tipos"],
    ], [1800, 3400, 3800])

    d.heading("3. Organización del repositorio", 1)
    d.code("Pagina-Congreso-UTVM/\n├── package.json             # workspace y comandos generales\n├── pnpm-lock.yaml           # versiones resueltas\n├── docker-compose.yaml      # PostgreSQL 16\n└── apps/\n    ├── backend/\n    │   ├── src/             # módulos NestJS y recursos\n    │   ├── test/            # pruebas e2e, cuando existan\n    │   ├── dist/            # salida compilada\n    │   └── .env.example\n    └── frontend/\n        ├── src/             # páginas, componentes, servicios y estilos\n        ├── public/          # recursos estáticos\n        ├── quasar.config.ts\n        └── .env.example")
    d.heading("3.1 Convenciones", 2)
    for item in [
        "Backend: organización por dominio; cada módulo agrupa controller, service, DTO, entity y, cuando aplica, mapper.",
        "Frontend: páginas en src/pages, componentes reutilizables en src/components, acceso HTTP en src/services y lógica de consultas en src/composables.",
        "Los identificadores de la mayoría de entidades de dominio son UUID; algunos registros UTVM/EMS usan identificadores numéricos.",
        "Las bajas de participantes emplean borrado lógico mediante deleted_at; otros catálogos pueden utilizar eliminación física según su servicio.",
    ]: d.bullet(item)

    d.heading("4. Requisitos e instalación", 1)
    d.heading("4.1 Requisitos", 2)
    d.table(["Componente", "Versión/requisito"], [
        ["Node.js", ">= 22.12; el frontend declara compatibilidad con 22.12, 24 o 26"],
        ["pnpm", "11.9.0 (versión fijada en packageManager)"],
        ["PostgreSQL", "16 recomendado por docker-compose"],
        ["Docker/Compose", "Opcional, recomendado para la base local"],
        ["Supabase", "Proyecto, service role key y buckets configurados"],
        ["SMTP", "Cuenta válida; para Gmail, contraseña de aplicación"],
    ], [2600, 6400])
    d.heading("4.2 Instalación local", 2)
    d.code("# Desde la raíz del repositorio\npnpm install\n\n# Crear configuración local\ncp apps/backend/.env.example apps/backend/.env\ncp apps/frontend/.env.example apps/frontend/.env\n\n# Iniciar PostgreSQL (desde la raíz)\ndocker compose --env-file apps/backend/.env up -d postgres\n\n# Ejecutar backend y frontend en paralelo\npnpm dev")
    d.p("Alternativamente, ejecute pnpm dev:backend o pnpm dev:frontend desde la raíz. El backend escucha en el puerto definido por PORT o 3000; el frontend Quasar usa normalmente 9000 en desarrollo.")
    d.heading("4.3 Configuración de PostgreSQL", 2)
    d.p("El contenedor publica PostgreSQL solamente en 127.0.0.1 y conserva la información en el volumen postgres_data. POSTGRES_PORT representa el puerto del host; dentro del contenedor PostgreSQL utiliza 5432.")
    d.p("Importante: TypeORM tiene synchronize: true. En desarrollo crea o ajusta automáticamente el esquema, pero no debe considerarse un mecanismo de migración productiva.", bold=True)

    d.heading("5. Variables de entorno", 1)
    d.heading("5.1 Backend", 2)
    d.table(["Variable", "Propósito", "Ejemplo"], [
        ["PORT", "Puerto HTTP; opcional", "3000"],
        ["POSTGRES_HOST", "Servidor PostgreSQL", "localhost"],
        ["POSTGRES_PORT", "Puerto PostgreSQL", "5432"],
        ["POSTGRES_DB", "Base de datos", "congreso"],
        ["POSTGRES_USER", "Usuario", "postgres"],
        ["POSTGRES_PASSWORD", "Contraseña", "valor seguro"],
        ["FRONTEND_URL", "Origen permitido por CORS y enlaces", "http://localhost:9000"],
        ["BACKEND_URL", "URL pública del backend", "http://localhost:3000"],
        ["SUPABASE_URL", "URL del proyecto Supabase", "https://proyecto.supabase.co"],
        ["SUPABASE_SECRET_KEY", "Clave privada/service role", "No exponer al cliente"],
        ["SUPABASE_BUCKET", "Bucket de imágenes", "congreso-imagenes"],
        ["SUPABASE_VOUCHERS_BUCKET", "Bucket de comprobantes", "congreso_voucher"],
        ["SUPABASE_TIMEOUT_MS", "Tiempo límite de almacenamiento", "15000"],
        ["MAIL_HOST/PORT/SECURE", "Servidor SMTP", "smtp.gmail.com / 465 / true"],
        ["MAIL_USER/MAIL_PASS/MAIL_FROM", "Credenciales y remitente", "Cuenta y contraseña de aplicación"],
        ["QR_ACCESS_BASE_URL", "Base del enlace embebido en QR", "http://localhost:9000/acceso/qr"],
        ["CONGRESS_TIMEZONE", "Zona horaria operativa", "America/Mexico_City"],
        ["EMAIL_VERIFICATION_SECRET", "Firma de verificación de correo", "Secreto aleatorio y largo"],
        ["RECONOCIMIENTOS_JOB_ENABLED", "Activa preparación automática", "true"],
        ["RECONOCIMIENTOS_CRON", "Expresión del trabajo programado", "*/5 * * * *"],
        ["RECONOCIMIENTOS_TIMEZONE", "Zona del trabajo programado", "America/Mexico_City"],
    ], [2500, 3900, 2600])
    d.heading("5.2 Frontend", 2)
    d.table(["Variable", "Propósito", "Ejemplo"], [["VITE_API_URL", "URL base de la API, incluido /api", "http://localhost:3000/api/"]], [2500, 3900, 2600])
    d.p("Las variables que comienzan con VITE_ se integran al paquete del navegador. Nunca deben contener secretos. SUPABASE_SECRET_KEY y MAIL_PASS pertenecen exclusivamente al backend.")

    d.heading("6. Backend", 1)
    d.heading("6.1 Arranque y comportamiento global", 2)
    for item in [
        "Prefijo global: /api.",
        "CORS: permite el origen configurado en FRONTEND_URL y credenciales.",
        "Validación: ValidationPipe elimina propiedades no declaradas, rechaza campos extra y transforma tipos.",
        "Límite de solicitudes global: 30 por segundo, 100 por 10 segundos y 500 por minuto, con bloqueos temporales.",
        "Persistencia: conexión TypeORM a PostgreSQL, carga automática de entidades y zona America/Mexico_City.",
    ]: d.bullet(item)
    d.heading("6.2 Capas y responsabilidades", 2)
    d.table(["Elemento", "Responsabilidad"], [
        ["Controller", "Expone rutas, recibe parámetros/DTO y define respuestas HTTP."],
        ["DTO", "Contrato de entrada; validaciones con class-validator y transformaciones."],
        ["Service", "Reglas de negocio, transacciones y coordinación de repositorios."],
        ["Entity", "Modelo relacional TypeORM y asociaciones."],
        ["Mapper", "Transformación entre persistencia, consultas y respuestas."],
        ["Module", "Registro de controladores, proveedores, repositorios e importaciones."],
    ], [2400, 6600])
    d.heading("6.3 Módulos de dominio", 2)
    modules = [
        ["Congreso / DíaEvento", "Ciclo de vida del congreso y generación/listado de días del evento."],
        ["Ubicación", "Catálogo de sedes o espacios y relación con actividades."],
        ["Ponente", "Ponentes/panelistas, fotografía y relaciones con conferencias o talleres."],
        ["Conferencia", "Agenda de conferencias, ponente, congreso y ubicación."],
        ["Taller", "Talleres, capacidad e inscripciones por participante."],
        ["Foro empresarial", "Foros, logotipo y relaciones de agenda."],
        ["EMS / UTVM", "Altas individuales o múltiples, consulta, edición, baja/restauración y envío de QR."],
        ["Registro NSU", "Registro grupal, comprobante, participantes, verificación y validación de pago."],
        ["Externos", "Registro externo, verificación de correo, validación y QR."],
        ["ParticipanteAcceso", "Abstracción unificada mediante adaptadores para los cuatro tipos de participante."],
        ["QR acceso / Participante QR", "Emisión, asignación, correo, validación y confirmación de asistencia."],
        ["Archivos / Comprobantes", "Metadatos, validación y almacenamiento Supabase."],
        ["Gestión de contenido", "Noticias, banners, secciones, imágenes, slugs y página pública consolidada."],
        ["Reconocimientos", "Preparación manual/automática, renderizado, consulta y descarga PDF."],
        ["Login", "Localización del participante por correo y comprobación de condiciones de acceso."],
        ["Common", "Validadores, manejo de errores PostgreSQL, generación y bloqueos de recursos."],
    ]
    d.table(["Módulo", "Responsabilidad"], modules, [2700, 6300])

    d.heading("7. API REST", 1)
    d.p("Todas las rutas siguientes se anteponen con /api. El inventario resume los controladores disponibles en el código vigente; los cuerpos se validan mediante sus DTO correspondientes.")
    endpoints = [
        ["Login", "POST", "/login", "Acceso por correo"],
        ["Congresos", "POST/GET", "/congreso", "Crear o listar"], ["Congresos", "GET/PATCH/DELETE", "/congreso/:id", "Consultar, actualizar o eliminar"],
        ["Días", "POST", "/congresos/:congresoId/dias-evento/generar", "Generar días"], ["Días", "GET", "/congresos/:congresoId/dias-evento", "Listar días"],
        ["Ubicaciones", "POST/GET", "/ubicacion", "Crear o listar"], ["Ubicaciones", "GET/PATCH/DELETE", "/ubicacion/:id", "Detalle, edición o eliminación"],
        ["Ponentes", "POST/GET", "/ponente", "Crear o listar"], ["Ponentes", "GET/PATCH/DELETE", "/ponente/:id", "Detalle, edición o eliminación"],
        ["Conferencias", "POST/GET", "/conferencias", "Crear o listar"], ["Conferencias", "GET/PATCH/DELETE", "/conferencias/:id", "Detalle, edición o eliminación"],
        ["Talleres", "POST/GET", "/taller", "Crear o listar"], ["Talleres", "GET/PATCH/DELETE", "/taller/:id", "Detalle, edición o eliminación"],
        ["Inscripciones", "POST/GET", "/talleres/:tallerId/inscripciones", "Inscribir o listar"], ["Inscripciones", "POST", "/inscripcion-taller", "Inscripción desde el flujo nuevo"],
        ["Foros", "POST/GET", "/foro-empresarial", "Crear o listar"], ["Foros", "GET/PATCH/DELETE", "/foro-empresarial/:id", "Detalle, edición o eliminación"],
        ["EMS", "POST/GET", "/ems", "Crear o listar"], ["EMS", "POST", "/ems/multiple", "Carga múltiple"], ["EMS", "GET/PATCH/DELETE", "/ems/:id", "Detalle, edición o baja"], ["EMS", "PATCH", "/ems/:id/restore", "Restaurar"],
        ["UTVM", "POST/GET", "/utvm", "Crear o listar"], ["UTVM", "POST", "/utvm/multiple", "Carga múltiple"], ["UTVM", "GET/PATCH/DELETE", "/utvm/:id", "Detalle, edición o baja"], ["UTVM", "PATCH", "/utvm/:id/restore", "Restaurar"],
        ["NSU", "POST/GET", "/registro-nsu", "Registrar o listar"], ["NSU", "GET", "/registro-nsu/verificar-correo/:token", "Verificar correo"], ["NSU", "GET/PATCH/DELETE", "/registro-nsu/:id", "Detalle, edición o baja"], ["NSU", "PATCH/DELETE", "/registro-nsu/:id/participantes/:participanteId", "Editar o quitar integrante"],
        ["Externos", "POST/GET", "/externos", "Registrar o listar"], ["Externos", "GET", "/externos/verificar-correo/:token", "Verificar correo"], ["Externos", "GET/PATCH/DELETE", "/externos/:id", "Detalle, edición o baja"], ["Externos", "PATCH", "/externos/:id/restore", "Restaurar"],
        ["QR", "GET", "/acceso/qr/:token", "Validar token y mostrar resultado"], ["QR", "POST", "/acceso/qr/:token/confirmar", "Confirmar acceso"], ["QR", "POST", "/{tipo}/:id/qr-acceso/enviar", "Enviar QR con datos explícitos"], ["QR", "POST", "/{tipo}/:id/qr-acceso/enviar-automatico", "Enviar QR automáticamente"],
        ["Archivos", "POST", "/archivos", "Subir archivo"], ["Archivos", "GET/PATCH/DELETE", "/archivos/:id", "Consultar, reemplazar o eliminar"], ["Fotos", "POST", "/fotos", "Subir foto"], ["Fotos", "GET/PATCH/DELETE", "/fotos/:id", "Consultar, reemplazar o eliminar"],
        ["Contenido", "CRUD", "/gestion-contenido/{noticias|secciones|banners}", "Administración editorial"], ["Contenido", "POST/GET/PATCH/DELETE", "/gestion-contenido/imagenes/:destino/:id", "Ciclo de vida de imágenes"], ["Página pública", "GET", "/pagina-oficial/congresos/:congresoId", "Contenido consolidado"], ["Página pública", "GET", "/pagina-oficial/noticias/:slug", "Noticia pública"],
        ["Reconocimientos", "POST", "/reconocimientos/taller/:tallerId/preparar", "Preparar taller"], ["Reconocimientos", "POST", "/reconocimientos/conferencia/:conferenciaId/preparar", "Preparar conferencia"], ["Reconocimientos", "GET", "/reconocimientos", "Consulta paginada/filtrada"], ["Reconocimientos", "GET", "/reconocimientos/:id/pdf", "Descargar PDF"],
        ["Comprobantes", "GET", "/comprobantes/:id/visualizar", "Visualización controlada"],
    ]
    d.table(["Área", "Método", "Ruta", "Uso"], endpoints, [1500, 1600, 3800, 2100])
    d.heading("7.1 Convenciones HTTP", 2)
    for item in [
        "JSON es el formato por defecto; cargas de imágenes y comprobantes usan multipart/form-data.",
        "Los errores de validación producen respuestas 400; recursos inexistentes normalmente 404; conflictos de negocio 409; límites globales 429.",
        "Los endpoints de descarga establecen encabezados de archivo o contenido PDF según el controlador.",
        "La ruta exacta de envío QR cambia según el participante: externos, ems, utvm o registro-nsu con participante anidado.",
    ]: d.bullet(item)

    d.heading("8. Modelo de datos", 1)
    d.p("TypeORM define el esquema a partir de entidades. Las relaciones principales conectan cada actividad con un congreso y una ubicación; ponentes se asocian a actividades; participantes se normalizan para acceso, talleres y reconocimientos.")
    entities = [
        ["Congreso", "Evento raíz: nombre, descripción, fechas y relaciones de contenido/agenda."],
        ["DiaEvento", "Días generados dentro del rango del congreso."], ["Ubicacion", "Espacio y capacidad; relacionado con conferencias, talleres y foros."],
        ["Ponente", "Persona expositora o panelista; fotografía y actividades."], ["Conferencia", "Actividad con fecha, horario, ponente, congreso y ubicación."],
        ["Taller", "Actividad con cupo, fecha, horario, ponente, congreso, ubicación e inscripciones."], ["ForoEmpresarial", "Actividad empresarial y asociaciones de agenda."],
        ["Ems / Utvm / Externo", "Participantes según procedencia, datos de contacto y baja lógica."], ["RegistroNsu / ParticipanteNsu", "Registro agrupador, integrantes, estado de pago y comprobante."],
        ["ParticipanteAcceso", "Representación unificada del participante para QR, asistencia e inscripciones."], ["QrAcceso / DiaParticipante", "Token y control de acceso/asistencia por día."],
        ["InscripcionTaller", "Vínculo único participante–taller, sujeto a cupo y congreso."], ["ArchivoMultimedia", "Metadatos y referencia al objeto almacenado."], ["ArchivoComprobante", "Metadatos privados de comprobantes."],
        ["Noticia / Banner / SeccionContenido", "Contenido editorial, estado, publicación, slug y relación con congreso."], ["Reconocimiento", "Emisión por actividad/participante o ponente, estado, intentos y PDF."],
    ]
    d.table(["Entidad", "Descripción"], entities, [2600, 6400])
    d.heading("8.1 Relaciones relevantes", 2)
    d.code("Congreso 1 ── N Conferencia / Taller / Foro / DíaEvento\nUbicación 1 ── N Conferencia / Taller / Foro\nPonente 1 ── N Conferencia / Taller\nRegistroNSU 1 ── N ParticipanteNSU\nParticipanteAcceso 1 ── N QR/DíaParticipante/Reconocimiento\nTaller 1 ── N InscripciónTaller ── 1 ParticipanteAcceso\nCongreso 1 ── N Noticia / Banner / SecciónContenido")

    d.heading("9. Frontend", 1)
    d.heading("9.1 Estructura", 2)
    d.table(["Directorio", "Contenido"], [
        ["src/pages", "Vistas enrutables públicas, registros, QR y dashboards."], ["src/components", "Formularios, listas, contenido administrativo y retroalimentación."],
        ["src/composables", "Consultas y mutaciones reutilizables con Vue Query o estado reactivo."], ["src/services", "Cliente Axios y servicios de dominio."],
        ["src/stores", "Pinia; persistencia de formularios y estado compartido."], ["src/types", "Contratos TypeScript de API y contenido."], ["src/css", "Estilos globales y estilos por página."], ["src/router", "Mapa de rutas e historial HTML5."],
    ], [2600, 6400])
    d.heading("9.2 Rutas públicas", 2)
    d.table(["Ruta", "Función"], [
        ["/", "Página pública principal"], ["/agenda", "Programa del congreso"], ["/registro-externo", "Registro de externo"],
        ["/registro_nsu", "Registro NSU"], ["/registro_ems", "Registro EMS"], ["/registro_utvm", "Registro UTVM"],
        ["/registro_nsu/verificar", "Resultado de verificación de correo"], ["/talleres_u", "Catálogo público de talleres"],
        ["/conferencias_u", "Catálogo de conferencias"], ["/conferencias_u/:id", "Detalle de conferencia"],
        ["/panelistas_u", "Catálogo de panelistas"], ["/panelistas_u/:id", "Detalle de panelista"],
        ["/login", "Acceso del participante por correo"], ["/mi-qr", "Reenvío/consulta del QR"], ["/acceso/qr/:token", "Validación de acceso QR"],
    ], [3300, 5700])
    d.heading("9.3 Área administrativa", 2)
    d.p("Bajo /admin se encuentran el tablero y los CRUD de congresos, ubicaciones, participantes, conferencias, ponentes, reconocimientos, foros empresariales, página oficial, paneles y talleres. Varias rutas tienen alias sin el prefijo /admin para compatibilidad.")
    d.heading("9.4 Consumo de API y caché", 2)
    d.p("src/services/api.ts crea una instancia Axios con VITE_API_URL y JSON por defecto. setAuthToken permite adjuntar Authorization: Bearer, aunque el flujo de login actual no devuelve un token. Los composables encapsulan operaciones CRUD; TanStack Vue Query administra consultas, invalidación y estados de carga en varios dominios.")
    d.heading("9.5 Flujo de una pantalla administrativa", 2)
    d.code("Ruta Vue Router\n  → Página dashboard\n    → Formulario o lista reutilizable\n      → Composable de dominio\n        → Servicio/cliente Axios\n          → Endpoint NestJS\n            → Servicio + repositorio PostgreSQL/Supabase")

    d.heading("10. Flujos principales", 1)
    d.heading("10.1 Registro y validación", 2)
    for item in [
        "El usuario selecciona su tipo de registro y completa el formulario.",
        "El frontend envía JSON o multipart/form-data según exista comprobante.",
        "El backend valida el DTO, normaliza los datos y evita duplicados conforme a las reglas del servicio.",
        "NSU y externos incorporan verificación de correo; la validación administrativa determina el acceso cuando corresponde.",
        "La eliminación lógica permite restaurar EMS, UTVM, externos y registros NSU mediante endpoints específicos.",
    ]: d.bullet(item)
    d.heading("10.2 QR de acceso", 2)
    for item in [
        "El participante se resuelve mediante un adaptador de tipo UTVM, EMS, NSU o externo.",
        "El backend emite/asigna un token, genera la imagen QR y la envía por correo.",
        "El QR apunta a QR_ACCESS_BASE_URL/:token.",
        "La pantalla pública consulta GET /api/acceso/qr/:token y muestra el resultado.",
        "La confirmación POST registra o actualiza la asistencia del día y aplica controles contra reutilización inválida.",
    ]: d.bullet(item)
    d.heading("10.3 Talleres", 2)
    d.p("La inscripción resuelve al participante, valida el congreso y controla la capacidad mediante TallerCapacityService. La restricción única en inscripción evita que un participante tenga registros incompatibles dentro del mismo contexto definido por la entidad y el servicio.")
    d.heading("10.4 Reconocimientos", 2)
    d.p("Los reconocimientos pueden prepararse explícitamente por taller o conferencia y también mediante un trabajo programado. Se renderizan con pdf-lib, fuentes Noto Sans y fondos según el tipo; se registran estado, número de intentos, fecha de generación, hash y contenido PDF. La API permite filtrar registros y descargar el archivo.")
    d.heading("10.5 Contenido público", 2)
    d.p("El administrador gestiona noticias, banners y secciones en estado borrador/publicado. El backend controla slugs, relaciones e imágenes, y pagina-oficial entrega una vista consolidada consumida por la portada y la agenda.")

    d.heading("11. Archivos, correo e integraciones", 1)
    d.heading("11.1 Supabase Storage", 2)
    d.p("El backend utiliza una clave privada para operar los buckets de imágenes y comprobantes. La fábrica del cliente aplica un tiempo límite; los servicios validan archivos, coordinan almacenamiento y metadatos y contemplan reintentos/concurrencia. Los comprobantes deben tratarse como objetos privados y exponerse solamente mediante el endpoint controlado.")
    d.heading("11.2 Correo", 2)
    d.p("CorreoModule encapsula Nodemailer, plantillas Handlebars y el envío del QR. MAIL_SECURE debe corresponder al puerto SMTP; para Gmail se recomienda el puerto 465 con TLS y una contraseña de aplicación.")
    d.heading("11.3 Recursos de reconocimientos", 2)
    d.p("backend/src/resources contiene fondos JPG, fuentes y plantillas PPTX de referencia. La compilación debe conservar los recursos que usa el renderizador. Antes de desplegar, verifique su presencia en dist/resources.")

    d.heading("12. Seguridad", 1)
    d.heading("12.1 Controles implementados", 2)
    for item in [
        "Validación global estricta de DTO con rechazo de propiedades no permitidas.", "CORS limitado a FRONTEND_URL.",
        "Throttling global contra abuso básico.", "Secretos de almacenamiento y SMTP usados desde backend.",
        "Verificación de correo firmada para registros compatibles.", "Validación de tipo, tamaño y ciclo de vida de archivos.",
    ]: d.bullet(item)
    d.heading("12.2 Hallazgos del estado actual", 2)
    d.table(["Prioridad", "Observación", "Acción recomendada"], [
        ["Crítica", "El login por correo devuelve datos, no una sesión o JWT; no se observan guards de autorización en los controladores administrativos.", "Implementar autenticación fuerte, JWT/cookie segura, roles y guards en API; proteger rutas del frontend."],
        ["Alta", "TypeORM usa synchronize: true y no se observan migraciones.", "Crear migraciones versionadas y desactivar synchronize en producción."],
        ["Alta", "La API contiene operaciones administrativas y de lectura sin separación de permisos visible.", "Definir matriz de roles: administrador, staff de acceso, participante y público."],
        ["Alta", "El acceso por correo de EMS/UTVM no exige contraseña o segundo factor.", "Usar enlace mágico de un solo uso, OTP o credencial institucional."],
        ["Media", "La CSP mostrada está configurada para el servidor de desarrollo y permite unsafe-inline/unsafe-eval.", "Definir cabeceras productivas en el proxy y reducir directivas permisivas."],
        ["Media", "No hay documentación Swagger/OpenAPI registrada en main.ts.", "Agregar Swagger, esquemas y ejemplos; limitarlo por ambiente si contiene información sensible."],
        ["Media", "FRONTEND_URL admite un solo origen.", "Validar una lista explícita si existen varios dominios autorizados."],
    ], [1300, 3800, 3900])
    d.heading("12.3 Gestión de secretos", 2)
    d.p("No versionar archivos .env reales. Rotar inmediatamente cualquier clave expuesta, usar secretos del proveedor de despliegue y mantener SUPABASE_SECRET_KEY, MAIL_PASS, POSTGRES_PASSWORD y EMAIL_VERIFICATION_SECRET fuera del navegador, logs y documentación pública.")

    d.heading("13. Pruebas y calidad", 1)
    d.heading("13.1 Comandos", 2)
    d.code("# Backend\npnpm --filter backend test\npnpm --filter backend test:cov\npnpm --filter backend lint\npnpm --filter backend build\n\n# Frontend\npnpm --filter frontend typecheck\npnpm --filter frontend lint:check\npnpm --filter frontend build\n\n# Compilación general\npnpm build")
    d.heading("13.2 Cobertura existente", 2)
    d.p("El backend contiene pruebas unitarias para validación y errores de base de datos, comprobantes, agenda, inscripciones y capacidad de talleres, reconocimientos y otros servicios. Jest busca archivos *.spec.ts dentro de src. El frontend dispone de verificación de tipos y lint, pero no se observa un runner de pruebas unitarias declarado en package.json.")
    d.heading("13.3 Estrategia recomendada", 2)
    for item in [
        "Unitarias para reglas de capacidad, conflictos de agenda, estados de pago, slugs y emisión de reconocimientos.",
        "Integración con PostgreSQL aislado para restricciones, transacciones y borrado lógico.",
        "E2E para registro, verificación, login, inscripción, envío/lectura QR y administración de contenido.",
        "Pruebas de contrato para evitar divergencias entre tipos TypeScript del frontend y DTO de backend.",
        "Pruebas de carga en validación QR y registros durante picos de ingreso.",
    ]: d.bullet(item)

    d.heading("14. Construcción y despliegue", 1)
    d.heading("14.1 Build", 2)
    d.code("pnpm install --frozen-lockfile\npnpm build\n\n# Backend generado\napps/backend/dist/\n\n# Frontend SPA generado por Quasar\napps/frontend/dist/spa/")
    d.heading("14.2 Backend productivo", 2)
    d.code("cd apps/backend\nnode dist/main.js")
    d.p("El proceso requiere todas las variables de entorno, conectividad con PostgreSQL, Supabase y SMTP, además de los recursos usados para PDF/correo. Se recomienda ejecutarlo detrás de un proxy TLS con health checks, logs centralizados y reinicio supervisado.")
    d.heading("14.3 Frontend productivo", 2)
    d.p("El resultado SPA debe servirse como contenido estático. Debido a vueRouterMode: history, el servidor debe reenviar rutas desconocidas a index.html. Configure VITE_API_URL durante el build y las cabeceras CSP/CORS para los dominios definitivos.")
    d.code("# Ejemplo conceptual de fallback\nlocation / {\n  try_files $uri $uri/ /index.html;\n}")
    d.heading("14.4 Lista de verificación", 2)
    for item in [
        "Desactivar synchronize y ejecutar migraciones aprobadas.", "Configurar HTTPS en frontend, API y enlaces QR.",
        "Configurar CORS, CSP y dominios públicos definitivos.", "Crear buckets y políticas de Supabase; probar carga, lectura y eliminación.",
        "Probar SMTP y revisar SPF, DKIM y DMARC del dominio remitente.", "Aplicar autenticación, autorización y rotación de secretos.",
        "Respaldar PostgreSQL y probar restauración.", "Ejecutar pruebas, typecheck, lint y build con el lockfile.",
        "Verificar zona horaria y cron de reconocimientos.", "Monitorear errores 4xx/5xx, latencia, almacenamiento y disponibilidad." ]: d.bullet(item)

    d.heading("15. Operación y mantenimiento", 1)
    d.heading("15.1 Respaldo", 2)
    d.p("Realizar copias programadas de PostgreSQL y conservar una política de retención. Los buckets de Supabase forman parte del respaldo lógico del sistema: la base contiene metadatos y el storage contiene los objetos. Ambos deben recuperarse de forma coordinada.")
    d.heading("15.2 Actualización", 2)
    d.code("git pull origin main\npnpm install --frozen-lockfile\npnpm build\n# ejecutar migraciones cuando se incorporen\n# reiniciar servicios y realizar smoke tests")
    d.heading("15.3 Observabilidad", 2)
    d.p("Registrar identificador de solicitud, ruta, estado, duración y error sin incluir datos personales, tokens, comprobantes ni secretos. Añadir health checks de API, PostgreSQL y dependencias externas, alertas del trabajo de reconocimientos y métricas de envío de correo.")

    d.heading("16. Solución de problemas", 1)
    d.table(["Síntoma", "Causa probable", "Verificación/solución"], [
        ["Frontend muestra “Falta configurar VITE_API_URL”", "No existe la variable al iniciar/compilar", "Crear frontend/.env y reiniciar Quasar."],
        ["CORS bloquea solicitudes", "FRONTEND_URL no coincide exactamente", "Ajustar protocolo, host y puerto; reiniciar backend."],
        ["Backend no conecta a PostgreSQL", "Host/puerto/credenciales incorrectos", "Revisar docker compose ps, variables y logs de PostgreSQL."],
        ["No se cargan imágenes", "Clave, bucket, política o CSP", "Validar Supabase URL/service key, existencia del bucket y dominio permitido."],
        ["No llegan correos", "SMTP, contraseña de aplicación o reputación", "Probar conexión TLS, remitente, spam y registros del dominio."],
        ["QR abre 404 al recargar", "Falta fallback de SPA", "Configurar el servidor para devolver index.html en rutas Vue."],
        ["QR apunta al ambiente equivocado", "QR_ACCESS_BASE_URL incorrecta", "Corregir URL pública y volver a emitir QR."],
        ["Respuesta 400 por campo desconocido", "ValidationPipe forbidNonWhitelisted", "Alinear payload con el DTO vigente."],
        ["Respuesta 429", "Límite global excedido", "Reducir ráfagas, implementar backoff o revisar límites con base en capacidad."],
        ["Reconocimiento no se genera", "Cron desactivado, recurso faltante o datos no elegibles", "Revisar variables RECONOCIMIENTOS_*, fondos/fuentes y estado de actividad."],
        ["Build frontend falla", "Node incompatible o error de tipos", "Usar Node admitido y ejecutar pnpm --filter frontend typecheck."],
    ], [2700, 3000, 3300])

    d.heading("17. Deuda técnica y ruta recomendada", 1)
    d.table(["Fase", "Acciones"], [
        ["Antes de producción", "Autenticación/autorización, migraciones, secretos, HTTPS, pruebas E2E críticas y respaldos."],
        ["Estabilización", "OpenAPI, manejo uniforme de errores, logs estructurados, health checks y CI obligatoria."],
        ["Evolución", "Pruebas frontend, contratos generados, auditoría administrativa, métricas y estrategia de archivos."],
    ], [2200, 6800])
    d.p("La prioridad debe ser proteger las operaciones administrativas y sustituir la sincronización automática del esquema. Después conviene formalizar la API y automatizar validaciones en integración continua.")

    d.heading("18. Glosario", 1)
    d.table(["Término", "Definición"], [
        ["EMS", "Participante proveniente de educación media superior."], ["NSU", "Participante no perteneciente a la UTVM, gestionado mediante registro con participantes y comprobante."],
        ["UTVM", "Participante perteneciente a la Universidad Tecnológica del Valle del Mezquital."], ["DTO", "Objeto que define y valida los datos de entrada o salida."],
        ["ORM", "Capa que representa tablas y relaciones mediante objetos TypeScript."], ["SPA", "Aplicación web de una sola página; requiere fallback a index.html."],
        ["CORS", "Política del navegador que controla orígenes permitidos."], ["CSP", "Política que limita fuentes de scripts, estilos, imágenes y conexiones."],
        ["Borrado lógico", "Marca de eliminación que conserva el registro para posible restauración."], ["Cron", "Expresión para ejecutar trabajos programados."],
    ], [2500, 6500])

    d.heading("19. Referencias internas", 1)
    for item in [
        "apps/backend/src/main.ts — arranque, CORS, prefijo y validación global.",
        "apps/backend/src/app.module.ts — módulos, PostgreSQL y throttling.",
        "apps/backend/.env.example — configuración de infraestructura e integraciones.",
        "apps/frontend/src/router/routes.ts — rutas públicas y administrativas.",
        "apps/frontend/src/services/api.ts — cliente HTTP.",
        "apps/frontend/quasar.config.ts — build, router, CSP de desarrollo y plugins.",
        "docker-compose.yaml — servicio PostgreSQL local.",
        "package.json de raíz, backend y frontend — scripts y dependencias.",
    ]: d.bullet(item)
    d.p()
    d.p("FIN DEL DOCUMENTO", bold=True, align="center")
    return d


if __name__ == "__main__":
    document = build()
    document.save(OUTPUT)
    print(OUTPUT)
