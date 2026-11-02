/** E-way bills are generated on the GST portal; the ERP only records them. */
export function PortalNote() {
  return (
    <div className="mb-6 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
      E-way bill numbers are generated on the GST portal (
      <a href="https://ewaybillgst.gov.in" target="_blank" rel="noreferrer" className="font-medium underline">
        ewaybillgst.gov.in
      </a>
      ) and recorded here. There is no direct API integration, so cancel or extend a bill on the portal as well.
    </div>
  );
}
