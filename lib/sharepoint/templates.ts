export type SharePointFolderTemplate = {
  name: string;
  children?: SharePointFolderTemplate[];
};

export const PROJECT_DELIVERY_TEMPLATE: SharePointFolderTemplate[] = [
  {
    name: "01 Programme & Scheduling",
    children: [
      { name: "Programme" },
      { name: "Look Aheads" },
      { name: "Progress Reports" },
      { name: "Weekly Reports" },
      { name: "Meeting Minutes" },
    ],
  },
  {
    name: "02 Commercial",
    children: [
      { name: "Dayworks" },
      { name: "Daily Dockets" },
      { name: "Monthly Claims" },
      { name: "Reports & Meetings" },
      {
        name: "Claims",
        children: [
          { name: "NDO" },
          { name: "DOV" },
          { name: "Variations" },
          { name: "EOT" },
        ],
      },
    ],
  },
  {
    name: "03 Quality",
    children: [
      { name: "ITCs" },
      { name: "ITPs" },
    ],
  },
  {
    name: "04 HSEQ",
    children: [
      { name: "SWMS" },
      { name: "Workpacks" },
      { name: "Registers" },
      { name: "Toolbox Talks" },
      { name: "Client Documents" },
      { name: "Management Plans" },
      { name: "Lift Studies" },
    ],
  },
  {
    name: "05 Drawings",
  },
  {
    name: "06 Onboarding",
    children: [
      { name: "Personnel" },
      { name: "Plant & Equipment" },
    ],
  },
  {
    name: "100 Incoming",
  },
  {
    name: "200 Outgoing",
  },
  {
    name: "999 Project Completion",
    children: [
      { name: "Lessons Learnt" },
    ],
  },
];

export const TENDERING_TEMPLATE: SharePointFolderTemplate[] = [
  {
    name: "01 RFQ & Scope",
  },
  {
    name: "02 Estimating",
  },
  {
    name: "03 Planning",
  },
  {
    name: "04 Pricing",
  },
  {
    name: "05 Supplier & Subcontractor Quotes",
  },
  {
    name: "06 Clarifications",
  },
  {
    name: "07 Submission",
  },
  {
    name: "08 Contract",
  },
  {
    name: "100 Incoming",
  },
  {
    name: "200 Outgoing",
  },
];