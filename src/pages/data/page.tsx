import { useState } from "react";
import { Database, Download, Upload, BookOpen, HardDrive } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import ExportPanel from "./_components/export-panel.tsx";
import ImportPanel from "./_components/import-panel.tsx";
import AccountingImportWizard from "./_components/accounting-import-wizard.tsx";
import BackupPanel from "./_components/backup-panel.tsx";

export default function DataPage() {
  const [importKey, setImportKey] = useState(0);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Database className="w-6 h-6" />
          Data Import & Export
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Export your data to CSV, import from spreadsheets, or migrate from accounting software
        </p>
      </div>

      <Tabs defaultValue="accounting-import">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="accounting-import" className="cursor-pointer">
            <BookOpen className="w-4 h-4 mr-2" />Accounting Import
          </TabsTrigger>
          <TabsTrigger value="export" className="cursor-pointer">
            <Download className="w-4 h-4 mr-2" />Export
          </TabsTrigger>
          <TabsTrigger value="import" className="cursor-pointer">
            <Upload className="w-4 h-4 mr-2" />CSV Import
          </TabsTrigger>
          <TabsTrigger value="backup" className="cursor-pointer">
            <HardDrive className="w-4 h-4 mr-2" />Full Backup
          </TabsTrigger>
        </TabsList>

        <TabsContent value="accounting-import" className="mt-4">
          <AccountingImportWizard />
        </TabsContent>

        <TabsContent value="export" className="mt-4">
          <ExportPanel />
        </TabsContent>

        <TabsContent value="import" className="mt-4 space-y-4" key={importKey}>
          <ImportPanel target="products" onComplete={() => setImportKey((k) => k + 1)} />
          <ImportPanel target="customers" onComplete={() => setImportKey((k) => k + 1)} />
        </TabsContent>

        <TabsContent value="backup" className="mt-4">
          <BackupPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
