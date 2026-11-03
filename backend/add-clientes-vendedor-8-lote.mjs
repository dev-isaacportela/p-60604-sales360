import 'dotenv/config';
import { configureSdkMitra, runDmlMitra, runQueryMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const SELLER_ID = 8;
const SELLER_BU = 'PADRAO';
const CHUNK_SIZE = 200;

const rawClientIds = `
1504
85
231
101314
175
39
169
101785
84
71
263
190
102389
16
101602
167
102211
1528
102013
101930
102352
13
102941
102522
101852
103126
193
103201
102964
101155
103457
212
102975
42
9321
103434
103134
103773
629
11
103787
103417
430
116
102302
101055
102246
103684
102075
52
104346
104342
157
103824
104427
3019
104206
102454
104153
102349
104517
103174
104203
104889
104674
104574
104601
104747
104749
105045
104952
104194
105262
105241
104820
105188
1247
105051
103115
105466
2784
104511
103978
235
105428
104475
259
105507
1525
938
102229
104573
105973
106123
104786
106384
106154
761
104209
426
106828
104592
106990
105992
104304
107204
107278
106170
106176
102
107512
107768
105968
107728
9
105470
107479
107843
472
104865
107889
107964
100578
106019
108028
7
101723
101200
101989
102149
102431
102650
102303
102951
101250
100160
102984
103030
103506
166
473
104046
104152
101120
104335
102873
104388
104360
104701
104989
104549
104807
105047
105015
105150
105227
104678
105109
105207
102434
105240
105479
105415
105871
105425
105781
106140
106108
105868
106290
104494
104682
107134
107248
104706
107391
105825
106094
107777
474
108075
106141
105279
107994
100552
101562
101387
101741
192
101041
101332
101343
102218
102725
102749
103291
3366
103368
1463
103250
2548
104445
104525
104508
104550
104367
15
104837
104982
462
105192
63
104941
105531
105719
105975
105935
106114
106328
107310
105252
105599
103095
107737
100878
31
101513
6
101772
100689
102263
1758
102731
103247
12720
103785
104035
100991
104453
104488
104567
105001
55
104011
103905
105335
105525
550
104607
105391
10059
102876
103094
103046
101477
103577
103401
104544
104394
108
104888
104811
105919
105690
104922
106006
105934
104870
104221
101705
107344
101371
102739
103340
103615
104262
104626
104640
104768
105254
101487
106
106146
106420
105506
108000
102145
101996
102152
102794
1261
101752
103982
103936
104753
104668
104843
104279
104030
104212
105099
106091
106001
106137
106246
107257
107583
106293
107517
107897
100931
102355
102985
103556
1777
`;

function parseClientIds(raw) {
  const ids = raw
    .split(/\s+/)
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);

  return [...new Set(ids)];
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function idsSql(ids) {
  return ids.join(', ');
}

async function getExistingClientIds(ids) {
  const found = new Set();
  const chunks = chunkArray(ids, CHUNK_SIZE);

  for (const chunk of chunks) {
    const response = await runQueryMitra({
      projectId,
      sql: `SELECT ID FROM CLIENTES WHERE ID IN (${idsSql(chunk)})`,
    });

    const rows = response?.result?.rows || [];
    for (const row of rows) {
      if (Number.isInteger(row.ID)) {
        found.add(row.ID);
      }
    }
  }

  return found;
}

async function applyToEquipeCliente(ids) {
  const chunks = chunkArray(ids, CHUNK_SIZE);

  for (const chunk of chunks) {
    await runDmlMitra({
      projectId,
      sql: `
        INSERT INTO EQUIPE_CLIENTE (ID_CLIENTE, ID_VENDEDOR, ID_BU, CRIADO_EM)
        SELECT
          C.ID,
          ${SELLER_ID},
          '${SELLER_BU}',
          SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
        FROM CLIENTES C
        WHERE C.ID IN (${idsSql(chunk)})
        ON DUPLICATE KEY UPDATE
          ID_VENDEDOR = VALUES(ID_VENDEDOR),
          CRIADO_EM = VALUES(CRIADO_EM)
      `,
    });
  }
}

async function syncLegacySellerOnClientes(ids) {
  const chunks = chunkArray(ids, CHUNK_SIZE);

  for (const chunk of chunks) {
    await runDmlMitra({
      projectId,
      sql: `
        UPDATE CLIENTES
        SET VENDEDOR_ID = ${SELLER_ID}
        WHERE ID IN (${idsSql(chunk)})
      `,
    });
  }
}

async function countCarteiraBySeller(ids) {
  const chunks = chunkArray(ids, CHUNK_SIZE);
  let total = 0;

  for (const chunk of chunks) {
    const response = await runQueryMitra({
      projectId,
      sql: `
        SELECT COUNT(*) AS TOTAL
        FROM EQUIPE_CLIENTE
        WHERE ID_VENDEDOR = ${SELLER_ID}
          AND COALESCE(NULLIF(TRIM(ID_BU), ''), 'PADRAO') = '${SELLER_BU}'
          AND ID_CLIENTE IN (${idsSql(chunk)})
      `,
    });

    const rows = response?.result?.rows || [];
    total += Number(rows[0]?.TOTAL || 0);
  }

  return total;
}

async function main() {
  const requestedClientIds = parseClientIds(rawClientIds);
  if (requestedClientIds.length === 0) {
    throw new Error('Nenhum cliente válido foi informado para vincular ao vendedor 8.');
  }

  const existingIdsSet = await getExistingClientIds(requestedClientIds);
  const existingIds = requestedClientIds.filter((id) => existingIdsSet.has(id));
  const missingIds = requestedClientIds.filter((id) => !existingIdsSet.has(id));

  if (existingIds.length === 0) {
    throw new Error('Nenhum dos IDs informados existe na tabela CLIENTES.');
  }

  await applyToEquipeCliente(existingIds);
  await syncLegacySellerOnClientes(existingIds);

  const carteiraCount = await countCarteiraBySeller(existingIds);

  console.log('Lote de clientes processado para o vendedor 8.');
  console.log(JSON.stringify({
    vendedorId: SELLER_ID,
    clientesRecebidos: requestedClientIds.length,
    clientesEncontrados: existingIds.length,
    clientesNaoEncontrados: missingIds.length,
    carteiraPadraoVendedor8: carteiraCount,
    primeirosClientesNaoEncontrados: missingIds.slice(0, 20),
  }, null, 2));
}

main().catch((error) => {
  console.error('Erro ao adicionar clientes para o vendedor 8:');
  console.error(error?.message || error);
  process.exit(1);
});
