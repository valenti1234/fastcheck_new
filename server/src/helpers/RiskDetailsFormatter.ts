import { format, parse } from 'date-fns';

export class RiskDetailsFormatter {
  private static formatDateDDMMYYYY(d: unknown): string | unknown {
    if (d == null) return d;
    try {
      let dt: Date;
      if (typeof d === 'string') {
        dt = /^\d{2}-\d{2}-\d{4}$/.test(d) ? parse(d, 'dd-MM-yyyy', new Date()) : new Date(d);
      } else {
        dt = new Date(d as any);
      }
      return isNaN(dt.getTime()) ? d : format(dt, 'dd/MM/yyyy');
    } catch {
      return d;
    }
  }

  public static formatDetails(label: string, detailsData: any[]) {
    if (!Array.isArray(detailsData)) {
      detailsData = [];
    }

    if (label == "Multas Laborales") {
      if (!detailsData || detailsData.length === 0) {
        return [
          /*  {
                Mensaje: "Rut no presenta registros de Multas Laborales"
            }
                */
        ];
      }
      return detailsData.map((item: any) => ({
        Motivo: item.infractionNumber,
        Boletin: item.boletinNumber,
        Fecha: RiskDetailsFormatter.formatDateDDMMYYYY(item?.boletinDate),
        "Tipo Infraccion": item.injuryType,
        // Infraccion: item.injuryDescription,
        monto: item.delinquencyAmount,
        Resolucion: item.resolutionNumber
      }));
    }
    else if (label == "Condenas por Prácticas Antisindicales") {
      return detailsData.map((item: any) => ({
        rit: item.rit,
        tribunal: item.tribunal,
        descripción: item.description,
        fecha: RiskDetailsFormatter.formatDateDDMMYYYY(item?.date),
        monto: item.fineAmount
      }));
    }

    /* ---------------------------------Compliance--------------------------------------------- */
    else if (label == "Procesos Sancionatorios Medioambientales") {
      if (!detailsData || detailsData.length === 0) {
        return [
          /*
            {
                Mensaje: "Rut no presenta registros de Procesos Sancionatorios Medioambientales"
            }

          */
        ];
      }

      return detailsData.map((item: any) => ({
        Expediente: item.numeroSancion || "",
        "Unidad Fiscalizable": "",
        Categoria: item.tipoSancion || "",
        Region: item.region || "",
        Estado: item.estado || "",
        Fecha: RiskDetailsFormatter.formatDateDDMMYYYY(item?.fechaImposicion)
      }));
    }

    else if (label == "Sanciones Medioambientales") {
      if (!detailsData || detailsData.length === 0) {
        return [
          /*
            {
                Mensaje: "Rut no presenta registros de Sanciones Medioambientales"
            }
                */
        ];
      }
      return detailsData.map((item: any) => ({
        Expediente: item.expediente || "",
        "Unidad Fiscalizable": item.nombre || "",
        Categoría: item.categoriaEconomicaNombre || "",
        "Tipo Sanción": item.procesoSancionTipoNombre || "",
        Región: item.regionNombre || "",
        "Multa UTA": item.multaTotalUTA ?? "",
        Estado: item.procesoSancionEstado || "",
        Fecha: RiskDetailsFormatter.formatDateDDMMYYYY(item?.fechaInicio)
      }));
    }

    else if (label == "Condenas Ley 21.121") {
      if (!detailsData || detailsData.length === 0) {
        return [
          /*
            {
                Mensaje: "Rut no presenta registros de Condenas Ley 21.121"
            }
                */
        ];
      }
      return detailsData.map((item: any) => ({
        "ROL de la Causa": item.rolCausa || "",
        "Fecha Desde": RiskDetailsFormatter.formatDateDDMMYYYY(item?.fechaDesde),
        Duración: item.duracion || "",
        Motivo: item.motivo || ""
      }));
    }
    else if (label == "Condenas Ley 20.393") {
      if (!detailsData || detailsData.length === 0) {
        return [
          /*
            {
                Mensaje: "Rut no presenta registros de Condenas Ley 20.393"
            }
                */
        ];
      }
      return detailsData.map((item: any) => ({
        motivo: item.motivo || "",
        rol: item.rol || "",
        Desde: item.Desde || "",
        Hasta: item.Hasta || ""
      }));
    }


    else if (label == "Listas Internacionales") {
      if (!detailsData || detailsData.length === 0) {
        return [
          /*
            {
                Mensaje: "Rut no presenta registros en Listas Internacionales"
            }
                */
        ];
      }
      return detailsData.map((item: any) => ({
        Nombre: "",
        Lista: item.listasInternacionalesDetected ?? ""
      }));
    }

    else if (label == "Listas Propias Alto Impacto") {
      if (!detailsData || detailsData.length === 0) {
        return [
          /*
            {
                Mensaje: "Rut no presenta registros en Listas Propias de Alto Impacto"
            }
                */
        ];
      }
      return detailsData.map((item: any) => ({
        Rut: item.rut || "",
        Nombre: item.nombre || "",
        "Tipo Persona": item.tipoPersona || "",
        "Tipo Lista": item.tipoLista || "",
        "Nombre Sub Lista": item.nombreSubLista || "",
        "Fecha Incorporación": RiskDetailsFormatter.formatDateDDMMYYYY(item?.fechaIncorporacion)
      }));
    }

    else if (label == "Listas Propias Mediano Impacto") {
      if (!detailsData || detailsData.length === 0) {
        return [
          /*
            {
                Mensaje: "Rut no presenta registros en Listas Propias de Mediano Impacto"
            }
                */
        ];
      }
      return detailsData.map((item: any) => ({
        Rut: item.rut || "",
        Nombre: item.nombre || "",
        "Tipo Persona": item.tipoPersona || "",
        "Tipo Lista": item.tipoLista || "",
        "Nombre Sub Lista": item.nombreSubLista || "",
        "Fecha Incorporación": RiskDetailsFormatter.formatDateDDMMYYYY(item?.fechaIncorporacion)
      }));
    }

    /* ---------------------------------Capital Humano--------------------------------------------- */
    else if (label == "Condenas por Prácticas Antisindicales") {
      if (!detailsData || detailsData.length === 0) {
        return [
          /*
            {
                Mensaje: "Rut no presenta registros de Condenas por prácticas Antisindicales"
            }
                */
        ];
      }
      return detailsData.map((item: any) => ({
        "Rut Afiliado": item.rutAfiliado || "",
        "Nombre Afiliado": item.nombreAfiliado || "",
        "Tipo Producto": item.tipoProducto || "",
        "Tipo entidad": item.afp || "",
        "Periodo": item.periodo || "",
        "Fecha carta": RiskDetailsFormatter.formatDateDDMMYYYY(item?.fecha),
        "Estado": "",
        "ID": item.id ?? ""
      }));
    }

    else if (label == "Deuda Previsional Presunta") {

      if (!detailsData || detailsData.length === 0) {
        return [
          /*
            {
                Mensaje: "Rut no presenta registros de Deuda Previsional Presunta"
            }
                */
        ];
      }
      return detailsData.map((item: any) => ({
        "Rut Afiliado": item.rutAfiliado || "",
        "Nombre Afiliado": item.nombreAfiliado || "",
        "Tipo Producto": item.tipoProducto || "",
        "Tipo entidad": item.afp || "",
        "Periodo": item.periodo || "",
        "Fecha carta": RiskDetailsFormatter.formatDateDDMMYYYY(item?.fecha),
        "Estado": "",
        "ID": item.id ?? ""
      }));
    }


    else if (label == "Deuda Previsional Publicada") {
      if (!detailsData || detailsData.length === 0) {
        return [/*
                {
                    Mensaje: "Rut no presenta registros de Deuda Previsional Publicada"
                }
                    */
        ];
      }
      return detailsData
        .filter((item: any) => item.injuryType !== "M")
        .map((item: any) => ({
          Motivo: item.infractionNumber || "",
          "Boletín": item.boletinNumber || "",
          Fecha: RiskDetailsFormatter.formatDateDDMMYYYY(item?.boletinDate),
          Meses: item.delinquencyMonthsNumber ?? "",
          Cotizaciones: item.delinquencyCotizacionNumber ?? "",
          Monto: item.delinquencyAmount,
          Tipo: item.injuryType || "",
          Institución: item.institutionName || ""
        }));
    }
    /* --------------------------------- Financiero - Tributario --------------------------------------------- */

    else if (label == "Protestos y Morosidades") {
      if (!detailsData || detailsData.length === 0) {
        return [
          /*
            {
                Mensaje: "Rut no presenta registros de Protestos y Morosidades"
            }
                */
        ];
      }
      return detailsData.map((item: any) => ({
        Vencimiento: (item as any).expirationDate || "",
        Monto: item.unpaidAmount || "",
        "Tipo de Deuda": item.justificationDescription || "",
        Publicación: item.visibilityDate || "",
      }));
    }


    else if (label == "Término de Giro") {
      if (!detailsData || detailsData.length === 0) {
        return [
          /*
            {
                Mensaje: "Rut no presenta registros de Término de Giro"
            }
                */
        ];
      }

      return detailsData.map((item: any) => {
        const match = item?.observaciones?.match(/(\d{2}-\d{2}-\d{4})$/);

        return {
          "Fecha término de Giro": match
            ? `La situación se presenta a contar del ${match[1]}`
            : ""
        };
      });
    }


    else if (label == "Contribuyente de difícil fiscalización") {
      if (!detailsData || detailsData.length === 0) {
        return [
          /*
            {
                Mensaje: "Rut no presenta registros de Contribuyente de Difícil Fiscalización"
            }
                */
        ];
      }
      return detailsData.map((item: any) => {
        const match = item?.situacionActual?.match(/(\d{2}-\d{2}-\d{4})$/);

        return {
          "Fecha Registro": match
            ? `La situación se presenta a contar del ${match[1]}`
            : ""
        };
      });
    }


    else if (label == "Inicio de Actividades") {
      const hasActivities = Array.isArray(detailsData) && detailsData.length > 0;
      return [
        {
          "Presenta Iniciación de actividades (NO)": hasActivities
            ? "Rut si presenta registros de Iniciación de Actividades"
            : "No tiene Iniciación de Actividades"
        }
      ];
    }

    /* --------------------------------- Legal --------------------------------------------- */

    else if (label == "Boletin Concursal") {
      if (!detailsData || detailsData.length === 0) {
        return [
          /*
            {
                Mensaje: "Rut no presenta registros en Boletín Concursal"
            }
                */
        ];
      }
      return detailsData.map((item: any) => ({
        "Tipo de Procedimiento": item.proceed || "",
        "Fecha de Publicación": item.dateBoletin || "",
        "Nombre Publicación": item.Nombre || "",
        "Veedor / Liquidador / Martillero": item.veedorLiquidadorTitular || ""
      }));
    }
    else if (label == "Causas Civiles") {
      //console.warn(1753, label, detailsData);
      if (!detailsData || detailsData.length === 0) {
        return [
          /*
            {
                Mensaje: "Rut no presenta registros de Causas Civiles"
            }
                */
        ];
      }
      //console.warn(1768, label, detailsData);
      return detailsData
        // Solo Demandado (DDO.) o Deudor (DDOR.)
        .filter((item: any) => item.sujeto === "DDO." || item.sujeto === "DDOR.")
        .map((item: any) => ({
          "Fecha de ingreso": item.fechaIngreso
            ? RiskDetailsFormatter.formatDateDDMMYYYY(item.fechaIngreso)
            : "",
          Postura: item.sujeto || "",
          Estado: item.estadoActual || "",
          Fase: item.estado || "",
          Etapa: item.etapa || "",
          Materia: item.proc || "",
          ROL: item.rol || "",
          Tribunal: item.tribunal || ""
        }));
    }

    else if (label == "Causas Laborales") {
      if (!detailsData || detailsData.length === 0) {
        return [
          /*
            {
                Mensaje: "Rut no presenta registros de Causas Laborales"
            }
                */
        ];
      }
      return detailsData
        // Solo Demandado / Demandado Solidario / Denunciado / Apoderado Demandado
        .filter((item: any) =>
          ["DDO.", "DDO.SO", "DNCDO.", "AP.DDO"].includes(item.sujeto)
        )
        .map((item: any) => ({
          Fecha: item.fechaIngreso
            ? RiskDetailsFormatter.formatDateDDMMYYYY(item.fechaIngreso)
            : "",
          Postura: item.sujeto || "",
          Estado: item.estadoActual || "",
          Fase: item.estado || "",
          Etapa: item.etapa || "",
          Materia: item.materia || "",
          ROL: item.rit || "",
          Tribunal: item.tribunal || ""
        }));
    }

    else if (label == "Causas de Cobranza Laboral") {
      if (!detailsData || detailsData.length === 0) {
        return [
          /*
            {
                Mensaje: "Rut no presenta registros de Causas de Cobranza Laboral"
            }
                */
        ];
      }
      return detailsData
        // Solo Apoderado Demandado / Demandado / Demandado Solidario
        .filter((item: any) =>
          ["AP.DDO", "DDO.", "DDO.SO"].includes(item.sujeto)
        )
        .map((item: any) => ({
          Fecha: item.fechaIngreso
            ? RiskDetailsFormatter.formatDateDDMMYYYY(item.fechaIngreso)
            : "",
          Postura: item.sujeto || "",
          Estado: item.estadoActual || "",
          Fase: item.estado || "",
          Etapa: item.etapa || "",
          Materia: item.proc || "",
          Monto: item.monto || "",
          ROL: item.rit || "",
          Tribunal: item.tribunal || ""
        }));
    }


    else if (label == "Quiebra judicial") {
      const hasQuiebra =
        Array.isArray(detailsData) &&
        detailsData.length > 0 &&
        detailsData.some((item: any) => item["Quiebra Judicial"] === true);

      return [
        {
          "Quiebra judicial": hasQuiebra
            ? "Tiene Quiebra Judicial en Tribunales"
            : "Rut no presenta registros de Quiebra Judicial"
        }
      ];
    }


    else {
      console.warn(1432, `>>>>>>>>>>>>>> No format found for label: ${label}`);
      return detailsData;
    }

  }

}
