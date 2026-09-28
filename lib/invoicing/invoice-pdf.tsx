import "server-only"

import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer"
import type { InvoiceDocument } from "./invoice-document"

// ARCA no corta palabras con guion: una línea que no entra pasa entera abajo.
Font.registerHyphenationCallback((word) => [word])

// Réplica de la Factura C que genera "Comprobantes en línea" de ARCA, en A4.
const BORDER = "1pt solid #000"

const styles = StyleSheet.create({
  page: { padding: 22, fontFamily: "Helvetica", fontSize: 8.5, color: "#000" },
  box: { border: BORDER },
  copy: { borderBottom: BORDER, paddingVertical: 4, textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 13 },
  header: { flexDirection: "row", borderBottom: BORDER, position: "relative" },
  headerLeft: { width: "50%", borderRight: BORDER, padding: 8, paddingRight: 30 },
  headerRight: { width: "50%", padding: 8, paddingLeft: 34 },
  letterBox: {
    position: "absolute", left: "50%", top: 0, marginLeft: -26, width: 52, height: 50,
    border: BORDER, borderTop: 0, backgroundColor: "#fff", alignItems: "center", justifyContent: "center",
  },
  letter: { fontFamily: "Helvetica-Bold", fontSize: 30, lineHeight: 1 },
  letterCode: { fontFamily: "Helvetica-Bold", fontSize: 7, marginTop: 2 },
  issuerName: { fontFamily: "Helvetica-Bold", fontSize: 11, textAlign: "center", marginTop: 16, marginBottom: 14, textTransform: "uppercase" },
  title: { fontFamily: "Helvetica-Bold", fontSize: 18, marginBottom: 8 },
  line: { marginBottom: 4 },
  bold: { fontFamily: "Helvetica-Bold" },
  period: { flexDirection: "row", borderBottom: BORDER, paddingHorizontal: 8, paddingVertical: 5 },
  receiver: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 8, paddingTop: 6, paddingBottom: 3 },
  tableHead: { flexDirection: "row", marginTop: 3, backgroundColor: "#ccc", border: BORDER },
  th: { fontFamily: "Helvetica-Bold", fontSize: 7.5, paddingVertical: 4, paddingHorizontal: 3, textAlign: "center", borderRight: BORDER },
  row: { flexDirection: "row" },
  td: { paddingVertical: 4, paddingHorizontal: 3 },
  totals: { border: BORDER, paddingHorizontal: 10, paddingVertical: 8, alignItems: "flex-end" },
  totalLine: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 4, fontSize: 9 },
  footer: { flexDirection: "row", marginTop: 10, alignItems: "flex-start" },
  watermark: {
    position: "absolute", top: 330, left: 40, right: 40, textAlign: "center", color: "#dc2626", opacity: 0.18,
    fontFamily: "Helvetica-Bold", fontSize: 42, transform: "rotate(-30deg)",
  },
})

// Anchos de "Código | Producto / Servicio | Cantidad | U. Medida | Precio Unit. | % Bonif | Imp. Bonif. | Subtotal".
const COLUMNS = [
  { label: "Código", width: "8%", align: "left" },
  { label: "Producto / Servicio", width: "32%", align: "left" },
  { label: "Cantidad", width: "9%", align: "right" },
  { label: "U. Medida", width: "10%", align: "center" },
  { label: "Precio Unit.", width: "12%", align: "right" },
  { label: "% Bonif", width: "8%", align: "right" },
  { label: "Imp. Bonif.", width: "9%", align: "right" },
  { label: "Subtotal", width: "12%", align: "right" },
] as const

// `strong` imprime el valor en negrita, como ARCA hace con los datos clave.
function Field({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <Text style={styles.line}>
      <Text style={styles.bold}>{label}: </Text>
      {strong ? <Text style={styles.bold}>{value}</Text> : value}
    </Text>
  )
}

function InvoicePdf({ doc }: { doc: InvoiceDocument }) {
  const cells = [
    "", doc.description, "1,00", "unidades", doc.amount, "0,00", "0,00", doc.amount,
  ]
  return (
    <Document title={doc.fileName.replace(/\.pdf$/, "")} author={doc.issuer.name} creator="Quepia" producer="Quepia">
      <Page size="A4" style={styles.page}>
        {doc.isTest && <Text style={styles.watermark} fixed>HOMOLOGACIÓN{"\n"}SIN VALIDEZ FISCAL</Text>}

        <View style={styles.box}>
          <Text style={styles.copy}>ORIGINAL</Text>

          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.issuerName}>{doc.issuer.name}</Text>
              <Field label="Razón Social" value={doc.issuer.name} />
              <Field label="Domicilio Comercial" value={doc.issuer.address} />
              <Field label="Condición frente al IVA" value={doc.issuer.condition} strong />
            </View>
            <View style={styles.headerRight}>
              <Text style={[styles.title, doc.title.length > 10 ? { fontSize: 15 } : {}]}>{doc.title}</Text>
              <Text style={styles.line}>
                <Text style={styles.bold}>Punto de Venta: {doc.salesPoint}</Text>
                <Text style={styles.bold}>{"      "}Comp. Nro: {doc.number}</Text>
              </Text>
              <Field label="Fecha de Emisión" value={doc.issueDate} strong />
              <View style={{ height: 8 }} />
              <Field label="CUIT" value={doc.issuer.taxId} />
              <Field label="Ingresos Brutos" value={doc.issuer.grossIncome} />
              <Field label="Fecha de Inicio de Actividades" value={doc.issuer.activityStart} />
            </View>
            <View style={styles.letterBox}>
              <Text style={styles.letter}>{doc.voucherClass}</Text>
              <Text style={styles.letterCode}>COD. {doc.typeCode}</Text>
            </View>
          </View>

          <View style={styles.period}>
            <View style={{ width: "34%" }}><Field label="Período Facturado Desde" value={doc.periodFrom} /></View>
            <View style={{ width: "24%" }}><Field label="Hasta" value={doc.periodTo} /></View>
            <View style={{ width: "42%" }}><Field label="Fecha de Vto. para el pago" value={doc.dueDate} /></View>
          </View>

          <View style={styles.receiver}>
            <View style={{ width: "42%" }}>
              {doc.receiver.docLabel && doc.receiver.docNumber
                ? <Field label={doc.receiver.docLabel} value={doc.receiver.docNumber} />
                : <Text style={styles.line} />}
            </View>
            <View style={{ width: "58%" }}><Field label="Apellido y Nombre / Razón Social" value={doc.receiver.name} /></View>
            <View style={{ width: "42%" }}><Field label="Condición frente al IVA" value={doc.receiver.condition} /></View>
            <View style={{ width: "58%" }}><Field label="Domicilio" value={doc.receiver.address} /></View>
            <View style={{ width: doc.associated ? "42%" : "100%" }}><Field label="Condición de venta" value={doc.receiver.saleCondition} /></View>
            {doc.associated && (
              <View style={{ width: "58%" }}><Field label="Comprobante asociado" value={doc.associated} strong /></View>
            )}
          </View>
        </View>

        <View style={styles.tableHead}>
          {COLUMNS.map((column, index) => (
            <Text key={column.label} style={[styles.th, { width: column.width }, index === COLUMNS.length - 1 ? { borderRight: 0 } : {}]}>
              {column.label}
            </Text>
          ))}
        </View>
        <View style={styles.row}>
          {COLUMNS.map((column, index) => (
            <Text key={column.label} style={[styles.td, { width: column.width, textAlign: column.align }]}>
              {cells[index]}
            </Text>
          ))}
        </View>

        <View style={{ flexGrow: 1 }} />

        <View style={styles.totals}>
          <View style={styles.totalLine}><Text style={styles.bold}>Subtotal: $ </Text><Text style={{ width: 90, textAlign: "right" }}>{doc.amount}</Text></View>
          <View style={styles.totalLine}><Text style={styles.bold}>Importe Otros Tributos: $ </Text><Text style={{ width: 90, textAlign: "right" }}>0,00</Text></View>
          <View style={[styles.totalLine, { fontSize: 10, marginBottom: 0 }]}><Text style={styles.bold}>Importe Total: $ </Text><Text style={{ width: 90, textAlign: "right", fontFamily: "Helvetica-Bold" }}>{doc.amount}</Text></View>
        </View>

        <View style={styles.footer}>
          <View style={{ width: 92 }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de react-pdf dibuja en el PDF y no tiene alt */}
            {doc.qrDataUrl && <Image src={doc.qrDataUrl} style={{ width: 86, height: 86 }} />}
          </View>
          <View style={{ flexGrow: 1, paddingTop: 4 }}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 20 }}>ARCA</Text>
            <Text style={{ fontSize: 6 }}>AGENCIA DE RECAUDACIÓN Y CONTROL ADUANERO</Text>
            <Text style={{ fontFamily: "Helvetica-BoldOblique", fontSize: 9, marginTop: 6 }}>Comprobante Autorizado</Text>
            <Text style={{ fontFamily: "Helvetica-Oblique", fontSize: 6, marginTop: 2 }}>
              Esta Agencia no se responsabiliza por los datos ingresados en el detalle de la operación
            </Text>
          </View>
          <View style={{ width: 200, paddingTop: 4 }}>
            <Text style={{ fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 10 }}>Pág. 1/1</Text>
            <Text style={[styles.line, { textAlign: "right" }]}><Text style={styles.bold}>CAE N°: </Text>{doc.cae}</Text>
            <Text style={[styles.line, { textAlign: "right" }]}><Text style={styles.bold}>Fecha de Vto. de CAE: </Text>{doc.caeExpiry}</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}

export function renderInvoicePdf(doc: InvoiceDocument): Promise<Buffer> {
  return renderToBuffer(<InvoicePdf doc={doc} />)
}
