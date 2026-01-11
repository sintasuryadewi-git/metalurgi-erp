'use client';

import { useState, useMemo, useEffect } from 'react';
import { 
  Users, Calculator, TrendingUp, FileText, 
  Download, Briefcase, 
  PieChart as PieIcon, Activity,
  CheckCircle2, AlertCircle, Loader2, Calendar, Package, Clock,
  Plus, Trash2, Save, Filter
} from 'lucide-react';
import { fetchSheetData } from '@/lib/googleSheets';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell 
} from 'recharts';

// --- TYPES ---
interface Employee {
  Employee_ID: string;
  Full_Name: string;
  Department: string; 
  Job_Title: string;
  Employment_Type: 'PERMANENT' | 'DAILY' | 'PIECE_RATE';
  Basic_Salary: number; 
  Allowance_Fixed: number;
}

interface Attendance {
  Date: string;
  Employee_ID: string;
  Status: string;
  Regular_Hours: number;
  Overtime_Hours: number;
}

interface ProductionLog {
  Date: string;
  Employee_ID: string;
  Qty_Good: number;
  Qty_Reject: number;
  Man_Hours_Spent: number;
}

interface PayrollItem {
  id: string;
  empId: string;
  name: string;
  dept: string;
  type: 'PERMANENT' | 'DAILY' | 'PIECE_RATE';
  daysWorked: number;
  otHours: number;
  qtyProduced: number;
  basicRate: number;
  basicIncome: number;
  allowance: number;
  overtimePay: number;
  gross: number;
  deductions: number;
  netPay: number;
  companyCost: number;
}

// Type untuk Jurnal Staging
interface JournalRow {
    id: string;
    coa: string;
    desc: string;
    debit: number;
    credit: number;
}

export default function PayrollPage() {
  const [activeTab, setActiveTab] = useState<'MASTER' | 'RUN' | 'INTELLIGENCE' | 'ACCOUNTING'>('MASTER'); // Default ke Employees untuk cek blank
  const [calcSubTab, setCalcSubTab] = useState<'PERMANENT' | 'DAILY' | 'PIECE_RATE'>('PERMANENT'); 
  
  const [loading, setLoading] = useState(true);
  
  // --- ENHANCED FILTER STATE ---
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1); // 1-12

  // Helper Period String (YYYY-MM)
  const period = useMemo(() => {
      return `${selectedYear}-${selectedMonth.toString().padStart(2, '0')}`;
  }, [selectedYear, selectedMonth]);

  // DATA POOLS
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [prodLogs, setProdLogs] = useState<ProductionLog[]>([]);
  const [config, setConfig] = useState<any>({});
  const [coaList, setCoaList] = useState<any[]>([]); 

  // ACCOUNTING STATE
  const [journalDate, setJournalDate] = useState(new Date().toISOString().split('T')[0]);
  const [draftJournals, setDraftJournals] = useState<JournalRow[]>([]);

  // COLORS
  const COLORS = { blue: '#3b82f6', amber: '#f59e0b', purple: '#8b5cf6', rose: '#ef4444', emerald: '#10b981', slate: '#64748b' };
  const PIE_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b'];

  // --- 1. LOAD DATA ---
  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      try {
        const savedConfig = localStorage.getItem('METALURGI_PAYROLL_CONFIG');
        if (savedConfig) setConfig(JSON.parse(savedConfig));

        const [empRaw, attRaw, prodRaw, coaRaw] = await Promise.all([
            fetchSheetData('Master_Employee'),
            fetchSheetData('Trx_Attendance'),
            fetchSheetData('Trx_Production_Log'),
            fetchSheetData('Master_COA')
        ]);

        setEmployees(empRaw as Employee[]);
        setAttendance(attRaw as Attendance[]);
        setProdLogs(prodRaw as ProductionLog[]);
        setCoaList(coaRaw as any[]);

      } catch (err) { console.error("Failed loading data:", err); } finally { setLoading(false); }
    };
    initData();
  }, []);

  // --- 2. ENGINE: CALCULATOR ---
  const payrollData = useMemo(() => {
      const result: PayrollItem[] = [];
      const periodStart = `${period}-01`;
      const periodEnd = `${period}-31`;

      const currentAttendance = attendance.filter(a => a.Date >= periodStart && a.Date <= periodEnd);
      const currentProd = prodLogs.filter(p => p.Date >= periodStart && p.Date <= periodEnd);

      employees.forEach(emp => {
          const empAtt = currentAttendance.filter(a => a.Employee_ID === emp.Employee_ID);
          const totalDays = empAtt.filter(a => a.Status === 'Present').length;
          const totalOT = empAtt.reduce((sum, a) => sum + (parseFloat(a.Overtime_Hours as any)||0), 0);
          
          const empProd = currentProd.filter(p => p.Employee_ID === emp.Employee_ID);
          const totalQty = empProd.reduce((sum, p) => sum + (parseFloat(p.Qty_Good as any)||0), 0);

          let basicIncome = 0;
          let otPay = 0;
          const basicRate = parseInt(emp.Basic_Salary as any) || 0;

          if (emp.Employment_Type === 'PERMANENT') {
              basicIncome = basicRate; 
              const hourlyRate = basicIncome / 173;
              otPay = totalOT * hourlyRate * (config.overtime_rate_1 || 1.5); 
          } else if (emp.Employment_Type === 'DAILY') {
              basicIncome = basicRate * totalDays; 
              const hourlyRate = basicRate / 7; 
              otPay = totalOT * hourlyRate * (config.overtime_rate_1 || 1.5);
          } else if (emp.Employment_Type === 'PIECE_RATE') {
              basicIncome = totalQty * basicRate; 
              otPay = 0; 
          }

          const allowance = parseInt(emp.Allowance_Fixed as any) || 0;
          const gross = basicIncome + allowance + otPay;
          const bpjsKaryawan = gross * 0.03; 
          const tax = gross > (config.ptkp_tk0/12) ? (gross * 0.05) : 0; 
          const deductions = bpjsKaryawan + tax;
          const companyCost = gross + (gross * 0.04);

          result.push({
              id: emp.Employee_ID, empId: emp.Employee_ID,
              name: emp.Full_Name, dept: emp.Department, type: emp.Employment_Type,
              daysWorked: totalDays, otHours: totalOT, qtyProduced: totalQty,
              basicRate, basicIncome, allowance, overtimePay: otPay,
              gross, deductions, netPay: gross - deductions, companyCost
          });
      });
      return result;
  }, [employees, attendance, prodLogs, period, config]);

  const getFilteredPayroll = (type: string) => payrollData.filter(p => p.type === type);

  // --- 3. ENGINE: INTELLIGENCE METRICS (UPDATED: HPP vs OPEX) ---
  const laborMetrics = useMemo(() => {
      // 1. Composition by Type
      const monthlyTotal = payrollData.filter(p=>p.type==='PERMANENT').reduce((a,b)=>a+b.companyCost,0);
      const dailyTotal = payrollData.filter(p=>p.type==='DAILY').reduce((a,b)=>a+b.companyCost,0);
      const pieceTotal = payrollData.filter(p=>p.type==='PIECE_RATE').reduce((a,b)=>a+b.companyCost,0);

      // 2. Composition HPP vs OPEX (By Department)
      // Logic: Production = Direct (HPP), Others = Indirect (OPEX)
      let totalDirect = 0;
      let totalIndirect = 0;
      
      payrollData.forEach(p => {
          if (p.dept === 'Production') totalDirect += p.companyCost;
          else totalIndirect += p.companyCost;
      });

      return { 
          chartDataType: [
            { name: 'Monthly Staff', cost: monthlyTotal, fill: COLORS.blue },
            { name: 'Daily/Outsource', cost: dailyTotal, fill: COLORS.amber },
            { name: 'Borongan', cost: pieceTotal, fill: COLORS.purple },
          ],
          chartDataAlloc: [
            { name: 'Direct Labor (HPP)', cost: totalDirect, fill: COLORS.emerald },
            { name: 'Indirect/OPEX', cost: totalIndirect, fill: COLORS.rose },
          ],
          totalCost: monthlyTotal + dailyTotal + pieceTotal,
          totalDirect,
          totalIndirect
      };
  }, [payrollData]);

  // --- 4. ENGINE: GENERATE DRAFT JOURNAL ---
  useEffect(() => {
      if (activeTab === 'ACCOUNTING') {
          const summaryByDept: Record<string, number> = {};
          let totalLiability = 0;

          payrollData.forEach(p => {
              summaryByDept[p.dept] = (summaryByDept[p.dept] || 0) + p.companyCost;
              totalLiability += p.companyCost; 
          });

          const rows: JournalRow[] = [];
          
          Object.keys(summaryByDept).forEach((dept, idx) => {
              let defaultCoa = '';
              if (dept === 'Production') defaultCoa = '5-2000'; // Direct Labor
              else if (dept === 'Sales') defaultCoa = '6-1000'; // Selling
              else defaultCoa = '6-2000'; // Admin

              rows.push({
                  id: `draft-dr-${idx}`,
                  coa: defaultCoa,
                  desc: `Payroll Expense - ${dept}`,
                  debit: summaryByDept[dept],
                  credit: 0
              });
          });

          rows.push({
              id: `draft-cr-1`,
              coa: '2-1200',
              desc: `Accrued Payroll ${period}`,
              debit: 0,
              credit: totalLiability
          });

          setDraftJournals(rows);
      }
  }, [activeTab, payrollData, period]);

  // --- ACTIONS ---
  const updateDraftRow = (id: string, field: keyof JournalRow, val: any) => {
      const updated = draftJournals.map(row => row.id === id ? { ...row, [field]: val } : row);
      setDraftJournals(updated);
  };

  const addDraftRow = () => {
      setDraftJournals([...draftJournals, { id: `new-${Date.now()}`, coa: '', desc: 'Adjustment', debit: 0, credit: 0 }]);
  };

  const removeDraftRow = (id: string) => {
      setDraftJournals(draftJournals.filter(r => r.id !== id));
  };

  const handlePostToGL = () => {
      const totalDr = draftJournals.reduce((a,b)=>a+b.debit,0);
      const totalCr = draftJournals.reduce((a,b)=>a+b.credit,0);
      if (Math.abs(totalDr - totalCr) > 100) return alert(`Unbalanced! Dr: ${fmtMoney(totalDr)} vs Cr: ${fmtMoney(totalCr)}`);

      const docId = `PAYROLL-${period}`;
      const finalEntries = draftJournals.map(row => ({
          id: `J-${Date.now()}-${Math.random().toString(36).substr(2,5)}`,
          date: journalDate,
          desc: row.desc,
          ref: docId,
          debit_acc: row.debit > 0 ? row.coa : '',
          credit_acc: row.credit > 0 ? row.coa : '',
          amount: row.debit > 0 ? row.debit : row.credit
      }));

      const existingGL = JSON.parse(localStorage.getItem('METALURGI_GL_JOURNALS') || '[]');
      localStorage.setItem('METALURGI_GL_JOURNALS', JSON.stringify([...existingGL, ...finalEntries]));
      alert(`Posted to GL! Date: ${journalDate}`);
  };

  const fmtMoney = (n: number) => "Rp " + n.toLocaleString('id-ID');

  return (
    <div className="space-y-6 pb-20 bg-slate-50 min-h-screen font-sans text-slate-800">
      
      {/* HEADER WITH DYNAMIC FILTER */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="text-blue-600"/> Payroll Intelligence {loading && <Loader2 className="animate-spin" size={16}/>}
          </h1>
          <p className="text-slate-500 text-xs mt-1">Multi-type Labor Cost Analysis (Monthly, Daily, Borongan).</p>
        </div>
        
        {/* Dynamic Period Filter */}
        <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-lg border border-slate-200">
           <Filter size={14} className="text-slate-400 ml-2"/>
           
           {/* Year Select */}
           <select 
              value={selectedYear} 
              onChange={(e)=>setSelectedYear(parseInt(e.target.value))}
              className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer"
           >
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
           </select>
           
           <span className="text-slate-300">/</span>
           
           {/* Month Select */}
           <select 
              value={selectedMonth} 
              onChange={(e)=>setSelectedMonth(parseInt(e.target.value))}
              className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer"
           >
              {Array.from({length:12}, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>{new Date(0, m-1).toLocaleString('id-ID', {month:'long'})}</option>
              ))}
           </select>

           <button className="flex items-center gap-2 bg-slate-800 text-white px-3 py-1.5 rounded-md text-xs font-bold hover:bg-slate-900 ml-2">
              <Download size={12}/> Export
           </button>
        </div>
      </div>

      {/* MAIN TABS */}
      <div className="flex justify-center mb-4">
         <div className="bg-slate-100 p-1 rounded-xl flex gap-1 shadow-inner">
            <button onClick={() => setActiveTab('MASTER')} className={`px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'MASTER' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Users size={16}/> Employees</button>
            <button onClick={() => setActiveTab('RUN')} className={`px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'RUN' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Calculator size={16}/> Calculation</button>
            <button onClick={() => setActiveTab('INTELLIGENCE')} className={`px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'INTELLIGENCE' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><TrendingUp size={16}/> Labor Cost</button>
            <button onClick={() => setActiveTab('ACCOUNTING')} className={`px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'ACCOUNTING' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><FileText size={16}/> Accounting</button>
         </div>
      </div>

      {/* === TAB: EMPLOYEES (FIXED BLANK SCREEN) === */}
      {activeTab === 'MASTER' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in">
              <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase"><tr><th className="p-4">ID</th><th className="p-4">Name</th><th className="p-4">Dept</th><th className="p-4">Job Title</th><th className="p-4">Type</th><th className="p-4 text-right">Basic Salary / Rate</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                      {employees.length === 0 && (
                          <tr><td colSpan={6} className="p-8 text-center text-slate-400 italic">Data Karyawan Kosong. Silakan isi Sheet 'Master_Employee'.</td></tr>
                      )}
                      {employees.map((e, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                              <td className="p-4 font-mono text-xs font-bold text-slate-600">{e.Employee_ID || '-'}</td>
                              <td className="p-4 font-bold text-slate-800">{e.Full_Name || 'No Name'}</td>
                              <td className="p-4"><span className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-bold">{e.Department || '-'}</span></td>
                              <td className="p-4 text-slate-600">{e.Job_Title || '-'}</td>
                              <td className="p-4">
                                  <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${e.Employment_Type==='PERMANENT'?'bg-blue-100 text-blue-700':e.Employment_Type==='DAILY'?'bg-amber-100 text-amber-700':'bg-purple-100 text-purple-700'}`}>
                                      {e.Employment_Type || 'UNKNOWN'}
                                  </span>
                              </td>
                              <td className="p-4 text-right font-mono text-slate-700">{fmtMoney(e.Basic_Salary)}</td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      )}

      {/* === TAB: CALCULATION RUN === */}
      {activeTab === 'RUN' && (
          <div className="space-y-4 animate-in fade-in">
              <div className="flex border-b border-slate-200 bg-white px-6 pt-4 rounded-t-2xl">
                  <button onClick={() => setCalcSubTab('PERMANENT')} className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${calcSubTab === 'PERMANENT' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}><Briefcase size={16}/> Monthly Staff</button>
                  <button onClick={() => setCalcSubTab('DAILY')} className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${calcSubTab === 'DAILY' ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}><Clock size={16}/> Daily / Outsource</button>
                  <button onClick={() => setCalcSubTab('PIECE_RATE')} className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${calcSubTab === 'PIECE_RATE' ? 'border-purple-500 text-purple-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}><Package size={16}/> Borongan (Piece Rate)</button>
              </div>

              <div className="bg-white rounded-b-2xl border border-t-0 border-slate-200 shadow-sm overflow-hidden min-h-[400px]">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className={`text-xs uppercase ${calcSubTab==='PERMANENT'?'bg-blue-50 text-blue-800':calcSubTab==='DAILY'?'bg-amber-50 text-amber-800':'bg-purple-50 text-purple-800'}`}>
                            <tr><th className="p-3">Employee</th><th className="p-3 text-right">Income Basis</th><th className="p-3 text-right">Addons</th><th className="p-3 text-right font-bold">Gross</th><th className="p-3 text-right text-rose-600">Deductions</th><th className="p-3 text-right font-bold text-emerald-600">THP</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {getFilteredPayroll(calcSubTab).length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-400 italic">No Data Found for {period}</td></tr>}
                            {getFilteredPayroll(calcSubTab).map((p, i) => (
                                <tr key={i} className="hover:bg-slate-50">
                                    <td className="p-3"><div className="font-bold text-slate-700">{p.name}</div><div className="text-[10px] text-slate-400">{p.dept}</div></td>
                                    <td className="p-3 text-right text-slate-600">
                                        {calcSubTab==='PERMANENT' ? fmtMoney(p.basicRate) : 
                                         calcSubTab==='DAILY' ? `${p.daysWorked} Days x ${fmtMoney(p.basicRate)}` : 
                                         `${p.qtyProduced} Unit x ${fmtMoney(p.basicRate)}`}
                                    </td>
                                    <td className="p-3 text-right text-slate-600"><span className="text-[10px] block">Allow: {fmtMoney(p.allowance)}</span><span className="text-[10px] block text-amber-600">OT: {fmtMoney(p.overtimePay)}</span></td>
                                    <td className="p-3 text-right font-bold">{fmtMoney(p.gross)}</td>
                                    <td className="p-3 text-right text-rose-600">({fmtMoney(p.deductions)})</td>
                                    <td className="p-3 text-right font-bold text-emerald-600 bg-emerald-50/30">{fmtMoney(p.netPay)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                  </div>
              </div>
          </div>
      )}

      {/* === TAB: INTELLIGENCE (UPDATED WITH HPP vs OPEX CHART) === */}
      {activeTab === 'INTELLIGENCE' && (
          <div className="space-y-6 animate-in fade-in">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  
                  {/* Chart 1: By Employment Type */}
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                      <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2"><PieIcon size={18} className="text-blue-600"/> Breakdown by Type</h3>
                      <div className="flex-1 min-h-[250px] w-full">
                          <ResponsiveContainer>
                              <BarChart data={laborMetrics.chartDataType} layout="vertical" margin={{top:10, right:30, left:20, bottom:10}}>
                                  <CartesianGrid strokeDasharray="3 3" horizontal={false}/>
                                  <XAxis type="number" hide/><YAxis dataKey="name" type="category" width={100} tick={{fontSize:11}}/><Tooltip formatter={(v:any)=>fmtMoney(v)} cursor={{fill: 'transparent'}}/>
                                  <Bar dataKey="cost" radius={[0,4,4,0]} barSize={25}>{laborMetrics.chartDataType.map((e,i)=><Cell key={i} fill={e.fill}/>)}</Bar>
                              </BarChart>
                          </ResponsiveContainer>
                      </div>
                  </div>

                  {/* Chart 2: HPP vs OPEX (NEW) */}
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                      <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2"><Activity size={18} className="text-emerald-600"/> HPP vs OPEX Allocation</h3>
                      <div className="flex-1 min-h-[250px] w-full flex items-center justify-center">
                          <ResponsiveContainer>
                              <PieChart>
                                  <Pie data={laborMetrics.chartDataAlloc} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="cost">
                                      {laborMetrics.chartDataAlloc.map((e,i)=><Cell key={i} fill={e.fill}/>)}
                                  </Pie>
                                  <Tooltip formatter={(v:any)=>fmtMoney(v)}/>
                                  <Legend verticalAlign="bottom" height={36}/>
                              </PieChart>
                          </ResponsiveContainer>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs">
                          <div className="bg-emerald-50 p-2 rounded">
                              <span className="block text-emerald-600 font-bold mb-1">Direct Labor (HPP)</span>
                              <span className="block font-bold text-slate-800">{fmtMoney(laborMetrics.totalDirect)}</span>
                          </div>
                          <div className="bg-rose-50 p-2 rounded">
                              <span className="block text-rose-600 font-bold mb-1">Indirect/OPEX</span>
                              <span className="block font-bold text-slate-800">{fmtMoney(laborMetrics.totalIndirect)}</span>
                          </div>
                      </div>
                  </div>
              </div>

              {/* Total Summary Card */}
              <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-lg relative overflow-hidden flex flex-col justify-center">
                  <div className="relative z-10 flex justify-between items-center">
                      <div>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Total Company Labor Cost</p>
                          <h2 className="text-4xl font-bold">{fmtMoney(laborMetrics.totalCost)}</h2>
                          <div className="text-xs text-slate-400 mt-2">Termasuk Gaji, Tunjangan, Lembur & BPJS Kantor.</div>
                      </div>
                      <div className="text-right space-y-1">
                          <div className="text-xs text-slate-400">Periode</div>
                          <div className="text-lg font-bold text-white bg-white/10 px-3 py-1 rounded">{new Date(selectedYear, selectedMonth-1).toLocaleString('id-ID', {month:'long', year:'numeric'})}</div>
                      </div>
                  </div>
                  <div className="absolute right-0 bottom-0 opacity-10"><Activity size={120}/></div>
              </div>
          </div>
      )}

      {/* === TAB: ACCOUNTING === */}
      {activeTab === 'ACCOUNTING' && (
          <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm animate-in fade-in max-w-4xl mx-auto">
              
              <div className="flex justify-between items-end mb-6 border-b pb-4">
                  <div>
                      <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><FileText size={24} className="text-emerald-600"/> Journal Staging</h3>
                      <p className="text-sm text-slate-500 mt-1">Review & Edit COA sebelum posting ke General Ledger.</p>
                  </div>
                  <div>
                      <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Journal Date</label>
                      <input type="date" value={journalDate} onChange={(e)=>setJournalDate(e.target.value)} className="bg-slate-50 border p-2 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500"/>
                  </div>
              </div>

              <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden mb-6">
                  <table className="w-full text-left text-sm">
                      <thead className="bg-slate-100 text-slate-600 text-xs uppercase font-bold">
                          <tr><th className="p-3 w-[20%]">Account (COA)</th><th className="p-3 w-[30%]">Description</th><th className="p-3 w-[20%] text-right">Debit</th><th className="p-3 w-[20%] text-right">Credit</th><th className="p-3 w-[5%]"></th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                          {draftJournals.map((row, idx) => (
                              <tr key={row.id} className="hover:bg-white transition-colors group">
                                  <td className="p-2">
                                      <select className="w-full p-1.5 border rounded text-xs font-mono bg-white outline-none focus:border-blue-500" value={row.coa} onChange={(e)=>updateDraftRow(row.id, 'coa', e.target.value)}>
                                          <option value="">-- Select COA --</option>
                                          {coaList.map((c:any) => <option key={c.Account_Code} value={c.Account_Code}>{c.Account_Code} - {c.Account_Name}</option>)}
                                      </select>
                                  </td>
                                  <td className="p-2"><input type="text" className="w-full p-1.5 border rounded text-xs bg-white outline-none focus:border-blue-500" value={row.desc} onChange={(e)=>updateDraftRow(row.id, 'desc', e.target.value)}/></td>
                                  <td className="p-2"><input type="number" className="w-full p-1.5 border rounded text-xs text-right bg-white outline-none focus:border-blue-500" value={row.debit} onChange={(e)=>updateDraftRow(row.id, 'debit', parseFloat(e.target.value)||0)} disabled={row.credit > 0}/></td>
                                  <td className="p-2"><input type="number" className="w-full p-1.5 border rounded text-xs text-right bg-white outline-none focus:border-blue-500" value={row.credit} onChange={(e)=>updateDraftRow(row.id, 'credit', parseFloat(e.target.value)||0)} disabled={row.debit > 0}/></td>
                                  <td className="p-2 text-center"><button onClick={()=>removeDraftRow(row.id)} className="text-slate-300 hover:text-rose-500"><Trash2 size={16}/></button></td>
                              </tr>
                          ))}
                      </tbody>
                      <tfoot className="bg-slate-100 text-xs font-bold">
                          <tr><td colSpan={2} className="p-3 text-right text-slate-500">TOTAL BALANCE</td><td className="p-3 text-right text-slate-800">{fmtMoney(draftJournals.reduce((a,b)=>a+b.debit,0))}</td><td className="p-3 text-right text-slate-800">{fmtMoney(draftJournals.reduce((a,b)=>a+b.credit,0))}</td><td></td></tr>
                      </tfoot>
                  </table>
                  <div className="p-2 border-t border-slate-200"><button onClick={addDraftRow} className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50"><Plus size={14}/> Add Journal Row</button></div>
              </div>

              <div className="flex justify-end gap-3"><button onClick={handlePostToGL} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-3 rounded-xl shadow-lg shadow-emerald-200 transition-all flex items-center gap-2"><Save size={18}/> Post to GL</button></div>
          </div>
      )}

    </div>
  );
}