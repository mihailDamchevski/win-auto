import type { ElementSelector } from "../api/types";

type RoleMapping = Record<string, string[]>;

const ROLE_TO_CLASS_NAMES: RoleMapping = {
  textbox: ["Edit", "RichEditD2DPT", "Scintilla"],
  button: ["Button"],
  checkbox: ["Button"],
  radio: ["Button"],
  radiobutton: ["Button"],
  combobox: ["ComboBox", "ComboBoxLBox"],
  dropdown: ["ComboBox", "ComboBoxLBox"],
  list: ["ListBox", "SysListView32"],
  listbox: ["ListBox", "SysListView32"],
  listitem: ["ListBox", "SysListView32"],
  tree: ["SysTreeView32"],
  treeview: ["SysTreeView32"],
  menu: ["#32768"],
  menuitem: ["#32768"],
  tab: ["SysTabControl32"],
  scrollbar: ["ScrollBar"],
  toolbar: ["ToolbarWindow32"],
  statusbar: ["msctls_statusbar32"],
  status: ["msctls_statusbar32"],
  header: ["SysHeader32"],
  slider: ["msctls_trackbar32"],
  trackbar: ["msctls_trackbar32"],
  progress: ["msctls_progress32"],
  progressbar: ["msctls_progress32"],
  static: ["Static"],
  label: ["Static"],
  link: ["SysLink"],
  hyperlink: ["SysLink"],
  datetime: ["SysDateTimePick32"],
  datepicker: ["SysDateTimePick32"],
  calendar: ["SysMonthCal32"],
  ipaddress: ["SysIPAddress32"],
  hotkey: ["msctls_hotkey32"],
  richedit: ["RICHEDIT50W", "RichEdit20W", "RichEdit20A", "RichEditD2DPT"],
  animate: ["SysAnimate32"],
  animation: ["SysAnimate32"],
  tooltip: ["tooltips_class32"],
  updown: ["msctls_updown32"],
  spin: ["msctls_updown32"],
  rebar: ["ReBarWindow32"],
};

const TEXTBOX_CLASS_NAMES = ROLE_TO_CLASS_NAMES.textbox;

export function classNamesForSelector(selector: ElementSelector): string[] | undefined {
  const names: string[] = [];

  if (selector.role) {
    const roleLower = selector.role.toLowerCase().replace(/[\s_-]/g, "");
    const mapped = ROLE_TO_CLASS_NAMES[roleLower];
    if (mapped) {
      names.push(...mapped);
    }
  }

  if (selector.className) {
    names.push(selector.className);
  }

  return names.length > 0 ? names : undefined;
}

export const DEFAULT_NOTEPAD_CLASS_NAMES = TEXTBOX_CLASS_NAMES;
