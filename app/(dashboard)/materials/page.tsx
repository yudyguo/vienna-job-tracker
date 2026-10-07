import { DemoNotice } from "@/components/demo-notice";
import { MaterialRecordCard } from "@/components/material-record-card";
import { PageHeader } from "@/components/page-header";
import { groupMaterialVersions } from "@/lib/materials/group-materials";
import { listMaterials } from "@/lib/repositories";

export default async function MaterialsPage() {
  const { data: materials, demo } = await listMaterials();
  const records = groupMaterialVersions(materials);
  return (
    <>
      <PageHeader title="材料版本库" description="每种材料只占一条记录；在记录内切换语言和版本，并下载需要的文件格式。" />
      <DemoNotice show={demo} />
      <section className="material-list reveal" style={{ "--i": 2 } as React.CSSProperties}>
        {records.length ? records.map((record) => <MaterialRecordCard demo={demo} key={record.id} record={record} />) : <div className="empty-state"><div className="empty-state__mark">01</div><h2>还没有材料版本</h2><p>高匹配职位生成后，ATS、Hallmark 与 Cover Letter 会显示在这里。</p></div>}
      </section>
    </>
  );
}
