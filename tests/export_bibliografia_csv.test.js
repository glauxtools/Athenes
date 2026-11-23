// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escaparCelulaCsv,
  formatarAutoresCsv,
  construirMapaCaminhosPastas,
  exportarBibliografiaParaCsv,
  registroRelacaoParaArtigoCsv
} from '../src/core/athenes_export_bibliografia_csv.js';
import { parseCsv } from '../src/core/athenes_csv.js';

test('escaparCelulaCsv aplica RFC 4180 para separador, aspas e quebras de linha', () => {
  assert.equal(escaparCelulaCsv('Simples', ';'), 'Simples');
  assert.equal(escaparCelulaCsv('A; B', ';'), '"A; B"');
  assert.equal(escaparCelulaCsv('Texto "citado"', ';'), '"Texto ""citado"""');
  assert.equal(escaparCelulaCsv('Linha 1\nLinha 2', ','), '"Linha 1\nLinha 2"');
});

test('exportarBibliografiaParaCsv exporta conjunto bibliografico completo e faz round-trip com parseCsv', () => {
  const pastas = [
    { id: 'p_tcc', nome: 'TCC', subpastas: [{ id: 'p_scopus', nome: 'Scopus', subpastas: [] }] },
    { id: 'p_wos', nome: 'Web of Science', subpastas: [] }
  ];
  const mapaPastas = construirMapaCaminhosPastas(pastas);

  const artigos = [
    {
      id: 'art_1',
      chaveZotero: 'ZOT123',
      itemTypeZotero: 'journalArticle',
      titulo: 'Acústica Arquitetônica; "Otimização" & Simulação',
      autores: [
        { sobrenome: 'Silva', prenome: 'João' },
        { sobrenome: 'Pereira', prenome: 'Maria' }
      ],
      ano: '2025',
      publicacao: 'Journal of Sound and Vibration',
      editora: 'Elsevier',
      local: 'Londres',
      volume: '512',
      numero: '3',
      paginas: '101-125',
      doi: '10.1016/j.jsv.2025.01',
      isbn: '',
      issn: '0022-460X',
      url: 'https://example.org/art1',
      idioma: 'en',
      palavrasChave: ['acústica', 'otimização'],
      pastaId: 'p_scopus',
      pastasIds: ['p_scopus', 'p_wos'],
      resumoOriginal: 'Resumo em\nduas linhas.',
      camposZotero: {
        publicationTitle: 'Journal of Sound and Vibration',
        libraryCatalog: 'DOI.org (Crossref)',
        extra: 'Cited by: 42'
      },
      variaveisPersonalizadas: {
        'Método': ['FEM', 'BEM'],
        'Relevância': 'Alta'
      },
      statusLeitura: 'lido',
      corCapa: '#314F79',
      driveFileId: '1AbCdEfDriveId',
      driveFileName: 'silva_2025.pdf',
      fichamento: {
        resumoPessoal: 'Artigo fundamental.',
        metodologiaNotas: 'Usa elementos finitos.',
        citacoesMarcadas: [{ pagina: 105, texto: 'A otimização reduz 12 dB.' }],
        notasPagina: { '105': [{ texto: 'Conferir equação 4' }] }
      },
      atualizadoEm: '2026-11-23T14:00:00Z'
    },
    {
      id: 'art_2',
      chaveZotero: 'ZOT456',
      titulo: 'Segundo Artigo',
      autores: [{ sobrenome: 'Costa', prenome: 'Ana' }],
      ano: '2024',
      pastaId: 'p_tcc',
      variaveisPersonalizadas: { 'Relevância': 'Média' },
      driveFileId: 'drive_pdf_exemplo_ficticio'
    }
  ];

  const res = exportarBibliografiaParaCsv(artigos, { separador: ';', mapaPastas });
  assert.equal(res.totalLinhas, 2);
  assert.equal(res.separador, ';');
  assert.ok(res.csv.startsWith('\uFEFF'), 'deve incluir BOM UTF-8 para Excel pt-BR');

  const matriz = parseCsv(res.csv, ';');
  assert.equal(matriz.length, 3); // cabeçalho + 2 linhas
  const header = matriz[0];
  const row1 = matriz[1];
  const row2 = matriz[2];

  const col = (nome, row) => row[header.indexOf(nome)];

  assert.equal(col('ID', row1), 'art_1');
  assert.equal(col('Chave Zotero', row1), 'ZOT123');
  assert.equal(col('Título', row1), 'Acústica Arquitetônica; "Otimização" & Simulação');
  assert.equal(col('Autores', row1), 'Silva, João; Pereira, Maria');
  assert.equal(col('Primeiro Autor', row1), 'Silva, João');
  assert.equal(col('Pastas / Coleções', row1), 'TCC > Scopus; Web of Science');
  assert.equal(col('Resumo', row1), 'Resumo em duas linhas.');
  assert.equal(col('Zotero: extra', row1), 'Cited by: 42');
  assert.equal(col('Zotero: libraryCatalog', row1), 'DOI.org (Crossref)');
  assert.equal(col('Variável: Método', row1), 'FEM | BEM');
  assert.equal(col('Variável: Relevância', row1), 'Alta');
  assert.equal(col('Status de Leitura', row1), 'Lido');
  assert.equal(col('Possui PDF', row1), 'Sim');
  assert.equal(col('Google Drive ID', row1), '1AbCdEfDriveId');
  assert.equal(col('Qtd. Citações Marcadas', row1), '1');
  assert.equal(col('Citações Marcadas', row1), '(p. 105) A otimização reduz 12 dB.');
  assert.equal(col('Qtd. Notas de Página', row1), '1');
  assert.equal(col('Notas de Página', row1), 'p. 105: Conferir equação 4');

  // art_2 tem driveFileId fictício ("drive_pdf_...") -> não deve constar como PDF real
  assert.equal(col('Possui PDF', row2), 'Não');
  assert.equal(col('Google Drive ID', row2), '');
  assert.equal(col('Pastas / Coleções', row2), 'TCC');
  assert.equal(col('Variável: Relevância', row2), 'Média');
});

test('exportarBibliografiaParaCsv respeita separador virgula e grupos de colunas opcionais', () => {
  const res = exportarBibliografiaParaCsv(
    [{ id: 'a1', titulo: 'Teste, com vírgula', autores: [{ sobrenome: 'Lima', prenome: 'R.' }], ano: '2026' }],
    { separador: ',', comBom: false, incluirCamposZotero: false, incluirVariaveis: false, incluirEstudo: false }
  );
  assert.ok(!res.csv.startsWith('\uFEFF'));
  assert.ok(!res.colunas.includes('Status de Leitura'));
  const matriz = parseCsv(res.csv, ',');
  assert.equal(matriz[1][matriz[0].indexOf('Título')], 'Teste, com vírgula');
  assert.equal(formatarAutoresCsv({ autores: [{ sobrenome: 'Lima', prenome: 'R.' }] }), 'Lima, R.');
});

test('registroRelacaoParaArtigoCsv preserva artigo raw e suporta fallback de campos', () => {
  const raw = { id: 'x1', titulo: 'Original', doi: '10.1/abc' };
  const comRaw = registroRelacaoParaArtigoCsv({ id: 'x1', raw, meta: { folderPaths: ['TCC > Artigos'] } });
  assert.equal(comRaw.doi, '10.1/abc');
  assert.equal(comRaw._pastasResolvidasCsv, 'TCC > Artigos');

  const semRaw = registroRelacaoParaArtigoCsv({
    id: 'x2',
    label: 'Fallback',
    fields: { title: 'Fallback', author: ['Souza, L.'], year: '2023', doi: '10.2/xyz', venue: 'Revista X' },
    meta: { folderPaths: ['Coleção Principal'], variaveis: { Tema: 'Urbano' } }
  });
  const res = exportarBibliografiaParaCsv([semRaw], { comBom: false });
  const m = parseCsv(res.csv, ';');
  assert.equal(m[1][m[0].indexOf('Título')], 'Fallback');
  assert.equal(m[1][m[0].indexOf('DOI')], '10.2/xyz');
  assert.equal(m[1][m[0].indexOf('Variável: Tema')], 'Urbano');
});
