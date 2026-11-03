import fs from 'fs';
const dir = '/home/user/w-18721/p-60604/uploads';
const base = 'Divisao_Carteira_de_Clientes_DF_10.26_NOVO_1792690316638';

function parse(file) {
  const txt = fs.readFileSync(`${dir}/${file}`, 'utf8');
  const out = [];
  let categoria = null;
  for (const line of txt.split('\n')) {
    if (!line.trim()) continue;
    // split CSV simples (sem quotes nos arquivos)
    const f = line.split(',');
    const c0 = (f[0] || '').trim();
    const c1 = (f[1] || '').trim();
    if (/^\d+$/.test(c0)) out.push({ codcli: parseInt(c0), nome: c1, categoria });
    else categoria = c0;
  }
  return out;
}

const fernanda = parse(`${base}_Fernanda.csv`);
const amanda = parse(`${base}_Amanda.csv`);
fs.writeFileSync('/home/user/w-18721/p-60604/backend/scripts-carteira/alvo.json',
  JSON.stringify({ fernanda, amanda }, null, 1));
console.log('Fernanda:', fernanda.length, 'clientes');
console.log('Amanda  :', amanda.length, 'clientes');
const dupF = fernanda.map(x=>x.codcli).filter((v,i,a)=>a.indexOf(v)!==i);
const dupA = amanda.map(x=>x.codcli).filter((v,i,a)=>a.indexOf(v)!==i);
const inter = fernanda.map(x=>x.codcli).filter(v => amanda.some(a=>a.codcli===v));
console.log('Duplicados dentro de Fernanda:', dupF);
console.log('Duplicados dentro de Amanda  :', dupA);
console.log('Clientes nas DUAS planilhas  :', inter);
console.log('\nCategorias Fernanda:', [...new Set(fernanda.map(x=>x.categoria))].join(' | '));
console.log('Categorias Amanda  :', [...new Set(amanda.map(x=>x.categoria))].join(' | '));
