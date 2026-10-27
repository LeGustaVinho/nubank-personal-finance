import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  X,
  FolderOpen,
  CreditCard,
  Landmark,
  Bot,
} from 'lucide-react';
import { CsvFileSummary } from '../../server/types';
import { formatBRL, formatDateBR } from '../utils/formatters';

interface CsvManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: CsvFileSummary[];
  onUploadFiles: (
    files: Array<{ fileName: string; content: string }>,
    autoAiClassify: boolean
  ) => Promise<{
    newTransactionsCount: number;
    aiClassifiedCount?: number;
    totalTransactions: number;
    results: Array<{
      fileName: string;
      detectedType: string;
      savedPath: string;
      rowsInFile: number;
      status: 'saved' | 'error';
      message: string;
    }>;
  }>;
}

export const CsvManagerModal: React.FC<CsvManagerModalProps> = ({
  isOpen,
  onClose,
  files,
  onUploadFiles,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [autoAiClassify, setAutoAiClassify] = useState(true);
  const [uploadReport, setUploadReport] = useState<{
    newTransactionsCount: number;
    aiClassifiedCount?: number;
    totalTransactions: number;
    results: Array<{
      fileName: string;
      detectedType: string;
      savedPath: string;
      rowsInFile: number;
      status: 'saved' | 'error';
      message: string;
    }>;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFileList = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setIsUploading(true);
    setUploadReport(null);

    try {
      const payload: Array<{ fileName: string; content: string }> = [];
      for (let i = 0; i < fileList.length; i++) {
        const f = fileList[i];
        const content = await f.text();
        payload.push({ fileName: f.name, content });
      }
      const res = await onUploadFiles(payload, autoAiClassify);
      setUploadReport(res);
    } finally {
      setIsUploading(false);
    }
  };

  const bankFiles = files.filter((f) => f.source === 'bankAccount');
  const ccFiles = files.filter((f) => f.source === 'creditCard');

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-violet-500/20 text-violet-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Central de Arquivos CSV & Importação Contínua com IA
              </h2>
              <p className="text-xs text-slate-400">
                Arraste novos CSVs do Nubank aqui ou salve direto nas pastas{' '}
                <code>bankAccount/</code> e <code>creditCard/</code>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5">
          {/* AI Auto-Classification Toggle */}
          <label className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-violet-500/10 border border-violet-500/30 cursor-pointer">
            <div className="flex items-center gap-2.5 text-xs">
              <Bot className="w-5 h-5 text-violet-400 shrink-0" />
              <div>
                <span className="font-bold text-white block">
                  Classificar estabelecimentos inéditos automaticamente via Antigravity / Gemini CLI (`agy.exe`)
                </span>
                <span className="text-slate-300">
                  Ao importar um novo CSV, estabelecimentos desconhecidos serão enviados ao Gemini CLI local para agrupamento e categorização inteligente.
                </span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={autoAiClassify}
              onChange={(e) => setAutoAiClassify(e.target.checked)}
              className="w-4 h-4 accent-violet-500 shrink-0"
            />
          </label>

          {/* Drag & Drop Upload Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              handleFileList(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center transition cursor-pointer ${
              isDragging
                ? 'border-violet-400 bg-violet-500/10'
                : 'border-slate-700 bg-slate-950/60 hover:border-violet-500/60 hover:bg-slate-900/60'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              multiple
              className="hidden"
              onChange={(e) => handleFileList(e.target.files)}
            />
            <UploadCloud className="w-10 h-10 text-violet-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-white">
              {isUploading
                ? 'Importando CSV e consultando Antigravity / Gemini CLI...'
                : 'Clique para selecionar ou arraste novos arquivos .CSV aqui'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              O sistema detecta sozinho pelo cabeçalho se é extrato de{' '}
              <strong className="text-sky-300">Conta Corrente</strong> ou fatura de{' '}
              <strong className="text-violet-300">Cartão de Crédito</strong>, salva na pasta correta e evita duplicatas.
            </p>
          </div>

          {/* Upload Feedback Report */}
          {uploadReport && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2 text-xs">
              <div className="flex items-center justify-between font-bold text-emerald-300">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Importação Concluída: {uploadReport.newTransactionsCount} novas
                  transações inéditas adicionadas •{' '}
                  {uploadReport.aiClassifiedCount || 0} novos padrões aprendidos via Gemini CLI (Total atual:{' '}
                  {uploadReport.totalTransactions})
                </span>
              </div>
              <div className="space-y-1">
                {uploadReport.results.map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-slate-200 font-mono text-[11px]"
                  >
                    {r.status === 'saved' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    )}
                    <span>{r.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Synchronized Folders Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Bank Account Files */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Landmark className="w-4 h-4 text-sky-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Pasta bankAccount/ ({bankFiles.length} arquivos)
                </h3>
              </div>
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-800/70 text-xs">
                {bankFiles.map((f) => (
                  <div
                    key={f.fileName}
                    className="py-2 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-[11px] text-slate-200 truncate">
                        {f.fileName}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {f.rowCount} linhas • {formatDateBR(f.minDate)} a{' '}
                        {formatDateBR(f.maxDate)}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[11px] font-semibold text-rose-300">
                        -{formatBRL(f.totalExpenses)}
                      </div>
                      <div className="text-[10px] text-emerald-400">
                        +{formatBRL(f.totalIncome)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Credit Card Files */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <CreditCard className="w-4 h-4 text-violet-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Pasta creditCard/ ({ccFiles.length} faturas)
                </h3>
              </div>
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-800/70 text-xs">
                {ccFiles.map((f) => (
                  <div
                    key={f.fileName}
                    className="py-2 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-[11px] text-slate-200 truncate">
                        {f.fileName}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {f.rowCount} lançamentos • Compras de{' '}
                        {formatDateBR(f.minDate)} a {formatDateBR(f.maxDate)}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[11px] font-semibold text-violet-300">
                        {formatBRL(f.totalExpenses)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <FolderOpen className="w-4 h-4 text-slate-500" />
            Sincronizado diretamente com o disco local
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
