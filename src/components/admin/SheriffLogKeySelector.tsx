import React, { useState, useEffect } from 'react';

interface SheriffLogKeySelectorProps {
  onChange: (value: string) => void;
  value: string;
}

const sheriffLogSchema = {
    "rut": "65026216-6",
    "isMonitoringRequest": false,
    "fetchedAt": {
      "$date": "2025-06-19T12:53:35.940Z"
    },
    "apiCallErrors": [
      {
        "step": "siiData",
        "message": "Request failed with status code 404",
        "data": "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<title>Error</title>\n</head>\n<body>\n<pre>Cannot GET /api/v1/helper/65026216-6/getSiiData</pre>\n</body>\n</html>\n"
      }
    ],
    "allCallsSucceeded": false,
    "loadRutData": {
      "success": true,
      "data": [
        "65026216-6"
      ]
    },
    "summaryData": {
      "success": true,
      "data": {
        "rut": "65026216-6",
        "corporationId": 774,
        "fechaCarga": "19-06-2025",
        "sii": {
          "razonSocial": "FUNDACION PROCULTURA",
          "presentaActividades": "SI",
          "inicioActividades": "25-10-2010",
          "autorizadoMonedaExtranjera": "NO",
          "empresaMenor": "SI",
          "observaciones": "Como recomendación general, siempre que se realicen transacciones comerciales con cualquier contribuyente, el SII aconseja verificar, en las opciones anteriores habilitadas, el timbraje del documento y que la actividad económica esté vigente en las bases de datos del Servicio. Además, se recomienda verificar que el domicilio y la actividad económica consignados en la factura o boleta que reciba, correspondan al vendedor o prestador del servicio ofrecido. Para un mayor resguardo, se recomienda efectuar el pago con cheque nominativo o vale vista a favor del proveedor, anotando al reverso el RUT del emisor y número del documento recibido.",
          "notas": "Si el contribuyente correspondiente al RUT consultado, no está de acuerdo o desconoce la situación informada en esta consulta, deberá concurrir a la unidad del SII correspondiente a su domicilio para aclarar o resolver su situación.Esta consulta no constituye una certificación del comportamiento tributario del contribuyente. De esta manera, si para un RUT no aparecen observaciones, no significa que en una posterior auditoría no se detecten problemas. \n\n\n\n\n\n\n\n\ncertifica(14444,'SITTRIB','TribTerc');\n\n\nmostrarPie()",
          "situacionActual": "No se encuentra en la Nómina de Contribuyentes de Difícil Fiscalización (NDF) vigente al periodo tributario Febrero/2025",
          "actividadEconomicaVigente": [
            {
              "activities": "VENTA AL POR MENOR DE LIBROS EN COMERCIOS ESPECIALIZADOS",
              "code": "476101",
              "category": "Primera",
              "ivaAffection": "Si",
              "date": "05-07-2012"
            },
            {
              "activities": "EDICION DE LIBROS",
              "code": "581100",
              "category": "Primera",
              "ivaAffection": "Si",
              "date": "05-07-2019"
            },
            {
              "activities": "OTROS TIPOS DE ENSEÑANZA N.C.P.",
              "code": "854909",
              "category": "Primera",
              "ivaAffection": "No",
              "date": "20-06-2023"
            },
            {
              "activities": "FUNDACIONES Y CORPORACIONES; ASOCIACIONES QUE PROMUEVEN ACTIVIDADES CU",
              "code": "949903",
              "category": "Primera",
              "ivaAffection": "Si",
              "date": "07-06-2010"
            }
          ],
          "documentosTimbrados": [
            {
              "document": "Facturas",
              "lastStampingYear": "2015"
            },
            {
              "document": "Factura No Afecta O Exenta Iva",
              "lastStampingYear": "2010"
            },
            {
              "document": "Factura Electronica",
              "lastStampingYear": "2023"
            },
            {
              "document": "Factura No Afecta O Exenta Electronica",
              "lastStampingYear": "2023"
            },
            {
              "document": "Boletas De Ventas Y Servicios",
              "lastStampingYear": "2015"
            },
            {
              "document": "Guia Despacho Electronica",
              "lastStampingYear": "2023"
            },
            {
              "document": "Notas De Credito",
              "lastStampingYear": "2014"
            },
            {
              "document": "Nota Credito Electronica",
              "lastStampingYear": "2023"
            },
            {
              "document": "Contabilidad En Hojas Sueltas Con Nro.Un",
              "lastStampingYear": "2023"
            },
            {
              "document": "Boleta De Terceros Electronicas",
              "lastStampingYear": "2023"
            },
            {
              "document": "Certificados De Donaciones",
              "lastStampingYear": "2018"
            }
          ],
          "activityCount": 4,
          "documentCount": 11
        },
        "siiBusinessSize": {
          "textSize": "Pequeña empresa",
          "icon": "warehouse",
          "annualSales": "5.000,01 a 10.000,00",
          "dependentWorkers": 241
        },
        "deudaBancariaSummary": {
          "date": "05/2025",
          "deudaDirectaComercial": 0,
          "deudaDirectaCastigada": 0,
          "deudaDirectaHipotecaria": 0,
          "deudaDirectaMorosa": 0,
          "deudaDirectaVencida": 0,
          "deudaDirectaVigente": 0,
          "deudaIndirectaCastigada": 0,
          "deudaIndirectaVencida": 0,
          "deudaIndirectaVigente": 0,
          "leasingMoroso": 0,
          "leasingVigente": 0,
          "lineaCredito": 0,
          "variation": {
            "date": "11/2024",
            "deudaDirectaComercial": 53,
            "deudaDirectaCastigada": 0,
            "deudaDirectaHipotecaria": 0,
            "deudaDirectaMorosa": 53,
            "deudaDirectaVencida": 0,
            "deudaDirectaVigente": 0,
            "deudaIndirectaCastigada": 0,
            "deudaIndirectaVencida": 0,
            "deudaIndirectaVigente": 0,
            "leasingMoroso": 0,
            "leasingVigente": 0,
            "lineaCredito": 0
          }
        },
        "boletinComercialSummary": {
          "casesInfocom": 3,
          "casesBolcom": 1,
          "casesDicom": 4,
          "amountInfocom": 1058002,
          "amountBolcom": 26566780,
          "amountDicom": 18065055,
          "variation": {
            "casesInfocom": 0,
            "casesBolcom": 0,
            "casesDicom": 4,
            "amountInfocom": 0,
            "amountBolcom": 0,
            "amountDicom": 18065055
          },
          "lastUpdate": "2025-06-19T10:36:40.417Z"
        },
        "judicialSummary": {
          "civilActiveCases": 7,
          "civilFiledCases": 0,
          "civilConcludedCases": 0,
          "cobranzaActiveCases": 5,
          "cobranzaFiledCases": 0,
          "cobranzaConcludedCases": 3,
          "laboralActiveCases": 16,
          "laboralFiledCases": 2,
          "laboralConcludedCases": 2,
          "currentCases": 28,
          "archivedCases": 2,
          "concludedCases": 5,
          "allCases": 35,
          "bankruptcyCases": 0,
          "activeFiledPosturesResume": {
            "Demandado": 30
          }
        },
        "boletinConcursalSummary": false,
        "moraPrevisionalSummary": {
          "totalCases": 328,
          "employees": 69,
          "variation": {
            "totalCases": 246
          }
        },
        "multaLaboralSummary": {
          "totalFines": 30,
          "totalFinesAmount": 31658648,
          "paidFines": 2,
          "finesPaidAmount": 6318648,
          "outstandingFines": 28,
          "outstandingFinesAmount": 25340000,
          "variation": {
            "totalFines": 30,
            "totalFinesAmount": 31658648,
            "paidFines": 2,
            "finesPaidAmount": 6318648,
            "outstandingFines": 28,
            "outstandingFinesAmount": 25340000
          }
        },
        "boletinLaboralSummary": {
          "totalAmount": 0,
          "variation": {
            "totalAmount": 0
          }
        },
        "boletinLaboralLastUpdate": "2025-06-19T10:36:41.130Z",
        "creditScoring": {
          "financesWeight": 0,
          "maxFinancesWeight": 100,
          "judicialWeight": 14.285714285714292,
          "judicialBankruptcy": false,
          "maxJudicialWeight": 100,
          "laborCollectionWeight": 0,
          "maxLaborCollectionWeight": 100,
          "bulletinWeight": 16.66666666666667,
          "maxBulletinWeight": 100,
          "numberOfHelpers": 3,
          "nameOfHelpers": [
            "judicial",
            "commertialBulletin",
            "laborCollection"
          ],
          "classificationPercentage": 30.952380952380963,
          "classificationLabel": "Critical",
          "financesWeighting": 0,
          "judicialWeighting": 14.285714285714292,
          "laborCollectionWeighting": 0,
          "commertialBulletinWeighting": 16.66666666666667,
          "maxJudicialWeighting": 100,
          "maxCommertialBulletinWeighting": 100,
          "maxFinancesWeighting": 100,
          "maxLaborCollectionWeighting": 100
        },
        "vehiclesSummary": {
          "totalAssessmentFrom": 450378,
          "vehiclesQuantity": 2
        },
        "propertiesSummary": {
          "propertiesQuantity": 2,
          "totalAppraisal": "38176866"
        },
        "cobranzaLaboralLastUpdate": "2025-06-18T12:46:19.293Z",
        "timestampsSubHelpers": [
          {
            "subhelperId": 1,
            "lastUpdate": "2025-02-13T15:13:37.663Z"
          },
        ],
        "compliance": {
          "id": 40167,
          "scrappedRutId": 25564,
          "userId": 1981,
          "corporationId": 774,
          "name": "FUNDACION PROCULTURA",
          "secondName": null,
          "surname": null,
          "secondSurname": null,
          "personType": "juridical",
          "risk": "critical",
          "summary": [
            {
              "countResults": 9,
              "textCountResults": 9,
              "table": "Penal",
              "risk": "critical",
              "useColor": true
            },
            {
              "countResults": 0,
              "textCountResults": 0,
              "table": "PEP Chile",
              "risk": "bajo",
              "useColor": true
            },
            {
              "countResults": 0,
              "textCountResults": 0,
              "table": "Funcionarios Públicos",
              "risk": "bajo",
              "useColor": true
            },
            {
              "countResults": 0,
              "textCountResults": 0,
              "table": "Familiares PEP",
              "risk": "bajo",
              "useColor": true
            },
            {
              "countResults": 0,
              "textCountResults": 0,
              "table": "Listas Internacionales",
              "risk": "bajo",
              "useColor": true
            },
            {
              "countResults": 1,
              "textCountResults": 1,
              "table": "Socios y Sociedades",
              "risk": "bajo",
              "useColor": false
            },
            {
              "countResults": 0,
              "textCountResults": 0,
              "table": "Noticias",
              "risk": "bajo",
              "useColor": false
            }
          ],
        }
      }
    }
};

const SheriffLogKeySelector: React.FC<SheriffLogKeySelectorProps> = ({ onChange, value }) => {
  const [path, setPath] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  useEffect(() => {
    if (value) {
      setPath(value.split('.'));
    } else {
      setPath([]);
    }
  }, [value]);

  const handleSelectChange = (index: number, selectedValue: string) => {
    const newPath = path.slice(0, index);
    if(selectedValue) {
      newPath.push(selectedValue);
    }
    
    let currentSchema: any = sheriffLogSchema;
    for (let i = 0; i < newPath.length; i++) {
      if (currentSchema && typeof currentSchema === 'object') {
        currentSchema = currentSchema[newPath[i]];
      } else if (Array.isArray(currentSchema)) {
        currentSchema = currentSchema[parseInt(newPath[i])];
      } else {
        currentSchema = null;
        break;
      }
    }

    if (currentSchema && currentSchema.table) {
      setSelectedTable(currentSchema.table);
    } else {
      setSelectedTable(null);
    }

    setPath(newPath);
    onChange(newPath.join('.'));
  };

  const renderDropdowns = () => {
    const dropdowns = [];
    let currentSchema: any = sheriffLogSchema;

    for (let i = 0; i <= path.length; i++) {
      if (Array.isArray(currentSchema)) {
        dropdowns.push(
          <select
            key={i}
            value={path[i] || ''}
            onChange={(e) => handleSelectChange(i, e.target.value)}
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline mt-2"
          >
            <option value="">Select Index...</option>
            {currentSchema.map((item, index) => (
              <option key={index} value={index.toString()}>{item.table || index}</option>
            ))}
          </select>
        );
        if (path[i] && currentSchema[parseInt(path[i])]) {
          currentSchema = currentSchema[parseInt(path[i])];
        } else {
          break;
        }
      } else if (currentSchema && typeof currentSchema === 'object') {
        const keys = Object.keys(currentSchema);
        dropdowns.push(
          <select
            key={i}
            value={path[i] || ''}
            onChange={(e) => handleSelectChange(i, e.target.value)}
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline mt-2"
          >
            <option value="">Select...</option>
            {keys.map(key => (
              <option key={key} value={key}>{key}</option>
            ))}
          </select>
        );

        if (path[i] && currentSchema[path[i]]) {
          currentSchema = currentSchema[path[i]];
        } else {
          break;
        }
      } else {
        break;
      }
    }
    
    if (selectedTable) {
      dropdowns.push(<div key="table-display" className="mt-2 p-2 bg-gray-100 rounded">Table: {selectedTable}</div>);
    }

    return dropdowns;
  };

  return <div>{renderDropdowns()}</div>;
};

export default SheriffLogKeySelector;