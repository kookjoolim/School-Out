
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DismissalRecord, UserRole, LunchData, Student, TeacherView } from './types';
import { generateGoodbyeMessage, fetchLunchMenu } from './services/geminiService';
import { db } from './services/firebase';
import { collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, writeBatch, getDoc, setDoc } from 'firebase/firestore';

// Declare SheetJS global
declare const XLSX: any;

// --- Default Data for Seeding ---
const INITIAL_STUDENTS: Omit<Student, 'id'>[] = [];

const RECENT_GRADUATE_STUDENTS = [
  { grade: 1, name: '김건우' }, { grade: 1, name: '김하설' }, { grade: 1, name: '서아인' },
  { grade: 2, name: '김태준' }, { grade: 2, name: '윤재성' }, { grade: 2, name: '윤지수' }, { grade: 2, name: '양혜린' },
  { grade: 3, name: '김온유' }, { grade: 3, name: '박소윤' }, { grade: 3, name: '서유인' },
  { grade: 4, name: '강태양' }, { grade: 4, name: '김다은' }, { grade: 4, name: '박가은' }, { grade: 4, name: '심은정' }, { grade: 4, name: '엄승환' }, { grade: 4, name: '최은율' }, { grade: 4, name: '박초연' },
  { grade: 5, name: '서상준' }, { grade: 5, name: '전지후' }, { grade: 5, name: '차승환' }, { grade: 5, name: '임지효' },
  { grade: 6, name: '강려울' }, { grade: 6, name: '강지온' }, { grade: 6, name: '박민혁' }, { grade: 6, name: '박수정' }, { grade: 6, name: '박시은' }, { grade: 6, name: '차은애' }
];

const DISMISSAL_METHODS = ['통학차', '에듀택시', '시내버스', '공부방 차량', '부모님 차량', '도보'];
const HOURS = ['1', '2', '3', '4'];
const MINUTES = ['00', '10', '20', '30', '40', '50'];

// --- Helper Functions ---
const isSameDate = (date1: Date, date2: Date) => {
  return date1.getFullYear() === date2.getFullYear() &&
         date1.getMonth() === date2.getMonth() &&
         date1.getDate() === date2.getDate();
};

const formatDateForInput = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

// --- UI Components ---

const AdminLoginModal = ({ isOpen, onClose, value, onChange, onSubmit }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-[320px] animate-fade-in text-center border border-gray-100">
        <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 mx-auto mb-4">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 00-2 2zm10-10V7a4 4 0 00-8 0v4h8z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <h3 className="text-xl font-black text-gray-900 mb-2">관리자 인증</h3>
        <form onSubmit={onSubmit}>
          <input 
            type="password" 
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="관리자 코드"
            autoFocus
            className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-2xl mb-4 focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 outline-none text-center text-xl tracking-[0.3em] font-black"
          />
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 text-gray-500 font-bold bg-gray-100 rounded-2xl hover:bg-gray-200 transition-colors text-sm">취소</button>
            <button type="submit" className="flex-1 py-3 text-white font-black bg-indigo-600 rounded-2xl hover:bg-indigo-700 transition-all text-sm">확인</button>
          </div>
        </form>
      </div>
    </div>
  );
};

const DeleteConfirmModal = ({ isOpen, onCancel, onConfirm, title, message, isDeleting }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center px-4">
      <div className="bg-white rounded-3xl p-8 w-full max-w-sm animate-fade-in shadow-2xl">
        <h3 className="text-xl font-black text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-500 mb-8 leading-relaxed">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-4 bg-gray-100 text-gray-500 font-bold rounded-2xl">취소</button>
          <button onClick={onConfirm} disabled={isDeleting} className="flex-1 py-4 bg-red-500 text-white font-bold rounded-2xl shadow-lg shadow-red-100 flex items-center justify-center gap-2">
            {isDeleting ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : '삭제'}
          </button>
        </div>
      </div>
    </div>
  );
};

function App() {
  const [role, setRole] = useState<UserRole>('STUDENT');
  const [teacherView, setTeacherView] = useState<TeacherView>('DASHBOARD');
  const [records, setRecords] = useState<DismissalRecord[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [lunchLoading, setLunchLoading] = useState(false);
  const [lunchInfo, setLunchInfo] = useState<LunchData | null>(null);
  const [lunchDate, setLunchDate] = useState<Date>(new Date());

  const [grade, setGrade] = useState<number>(1);
  const [name, setName] = useState<string>('');
  const [dismissalMethod, setDismissalMethod] = useState<string>(DISMISSAL_METHODS[0]);
  const [hour, setHour] = useState<string>('4');
  const [minute, setMinute] = useState<string>('30');
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminCodeInput, setAdminCodeInput] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState<Date>(new Date());
  const [exportStartDate, setExportStartDate] = useState(formatDateForInput(new Date()));
  const [exportEndDate, setExportEndDate] = useState(formatDateForInput(new Date()));
  const [newStudentName, setNewStudentName] = useState<Record<number, string>>({});

  const [deleteModal, setDeleteModal] = useState<{isOpen: boolean, type: 'RECORD' | 'STUDENT', id: string | null, name: string}>({ isOpen: false, type: 'RECORD', id: null, name: '' });
  const [isDeleting, setIsDeleting] = useState(false);
  const hasSeededRef = useRef(false);

  useEffect(() => {
    const unsubRecords = onSnapshot(query(collection(db, "dismissals"), orderBy("timestamp", "desc")), (snap) => {
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() } as DismissalRecord)));
    });
    const unsubStudents = onSnapshot(collection(db, "students"), async (snap) => {
      if (snap.empty) {
        try {
          const configDocRef = doc(db, "config", "system");
          const configSnap = await getDoc(configDocRef);
          if (configSnap.exists() && configSnap.data()?.seeded) {
            // Already seeded in the past, meaning the user intentionally emptied the list. Do not re-seed.
            setStudents([]);
            return;
          }
          
          // Seed the initial students and mark as seeded
          const batch = writeBatch(db);
          INITIAL_STUDENTS.forEach(s => batch.set(doc(collection(db, "students")), s));
          batch.set(configDocRef, { seeded: true });
          await batch.commit();
          hasSeededRef.current = true;
        } catch (e) {
          console.error("Error checking/seeding initial students:", e);
          setStudents([]);
        }
      } else {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Student));
        
        // Detect and automatically delete database records of graduated students to prevent them from resurfacing
        const studentsToDelete = list.filter(student => 
          RECENT_GRADUATE_STUDENTS.some(old => old.grade === student.grade && old.name === student.name)
        );
        if (studentsToDelete.length > 0) {
          const batch = writeBatch(db);
          studentsToDelete.forEach(student => {
            batch.delete(doc(db, "students", student.id));
          });
          batch.commit().catch(e => console.error("Error cleaning up graduated students:", e));
        }

        const remainingStudents = list.filter(student => 
          !RECENT_GRADUATE_STUDENTS.some(old => old.grade === student.grade && old.name === student.name)
        );
        setStudents(remainingStudents.sort((a, b) => a.grade === b.grade ? a.name.localeCompare(b.name, 'ko-KR') : a.grade - b.grade));
        
        // If snapshot is not empty and we haven't marked as seeded in this session, ensure the config flag is set in Firestore
        if (!hasSeededRef.current) {
          hasSeededRef.current = true;
          try {
            const configDocRef = doc(db, "config", "system");
            const configSnap = await getDoc(configDocRef);
            if (!configSnap.exists() || !configSnap.data()?.seeded) {
              await setDoc(configDocRef, { seeded: true });
            }
          } catch (e) {
            console.error("Error setting seeded flag:", e);
          }
        }
      }
    });
    return () => { unsubRecords(); unsubStudents(); };
  }, []);

  useEffect(() => { loadLunch(); }, [lunchDate]);

  const loadLunch = async (force: boolean = false) => {
    setLunchLoading(true);
    try {
      const data = await fetchLunchMenu(lunchDate, force);
      setLunchInfo(data);
    } catch (e) { setLunchInfo({ menuText: "급식 정보를 가져오지 못했습니다.", sources: [] }); }
    finally { setLunchLoading(false); }
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminCodeInput === 'hy6516') {
      setRole('TEACHER');
      setShowAdminLogin(false);
    } else { alert('코드가 올바르지 않습니다.'); }
  };

  const handleDismissalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    setLoading(true);
    const msg = await generateGoodbyeMessage(name, grade);
    const timestamp = new Date();
    timestamp.setHours(parseInt(hour) + 12, parseInt(minute), 0, 0);
    try {
      await addDoc(collection(db, "dismissals"), { studentName: name, grade, dismissalMethod, timestamp: timestamp.getTime(), message: msg });
      setHasSubmitted(true);
      setTimeout(() => { setHasSubmitted(false); setName(''); }, 2000);
    } catch (e) { alert("저장 실패"); }
    finally { setLoading(false); }
  };

  const handleConfirmDelete = async () => {
    if (!deleteModal.id) return;
    setIsDeleting(true);
    try {
      const coll = deleteModal.type === 'RECORD' ? 'dismissals' : 'students';
      await deleteDoc(doc(db, coll, deleteModal.id));
      setDeleteModal({ ...deleteModal, isOpen: false });
    } catch (e) { alert("삭제 실패"); }
    finally { setIsDeleting(false); }
  };

  const handleAddStudent = async (gradeLevel: number) => {
    const sName = newStudentName[gradeLevel]?.trim();
    if (!sName) return;
    try {
      await addDoc(collection(db, "students"), { name: sName, grade: gradeLevel });
      setNewStudentName({ ...newStudentName, [gradeLevel]: '' });
    } catch (e) { alert("학생 추가 실패"); }
  };

  const handleExport = () => {
    const start = new Date(exportStartDate); start.setHours(0,0,0,0);
    const end = new Date(exportEndDate); end.setHours(23,59,59,999);
    const filtered = records.filter(r => r.timestamp >= start.getTime() && r.timestamp <= end.getTime());
    const data = filtered.map(r => ({
      '날짜': new Date(r.timestamp).toLocaleDateString('ko-KR'),
      '시간': new Date(r.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      '학년': `${r.grade}학년`,
      '이름': r.studentName,
      '하교방법': r.dismissalMethod
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "하교기록");
    XLSX.writeFile(wb, `화양초_하교기록_${exportStartDate}_${exportEndDate}.xlsx`);
  };

  const studentsByGrade = useMemo(() => {
    const g: Record<number, Student[]> = {};
    [1,2,3,4,5,6].forEach(i => g[i] = students.filter(s => s.grade === i));
    return g;
  }, [students]);

  const filteredRecords = useMemo(() => 
    records.filter(r => isSameDate(new Date(r.timestamp), selectedDate)), 
  [records, selectedDate]);

  const getMethodColor = (method: string) => {
    if (method === '통학차') return 'text-red-500';
    if (method === '에듀택시') return 'text-[#92400e]'; // 갈색 계열
    return 'text-indigo-400';
  };

  const renderDashboard = () => (
    <div className="space-y-8 animate-fade-in max-w-4xl mx-auto text-[0.95rem]">
      {/* 캘린더와 데이터 도구 통합 섹션 */}
      <section className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 mb-8">
          <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2-2v12a2 2 0 002 2z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <h4 className="font-black text-gray-800 text-base uppercase tracking-tight">데이터 및 일정 관리</h4>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* 왼쪽: 캘린더 */}
          <div className="flex-1">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-4">
                <button onClick={() => setCurrentCalendarMonth(new Date(currentCalendarMonth.getFullYear(), currentCalendarMonth.getMonth() - 1))} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                <h4 className="text-lg font-black text-gray-900">{currentCalendarMonth.getFullYear()}년 {currentCalendarMonth.getMonth() + 1}월</h4>
                <button onClick={() => setCurrentCalendarMonth(new Date(currentCalendarMonth.getFullYear(), currentCalendarMonth.getMonth() + 1))} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2">
              {['일','월','화','수','목','금','토'].map((d, i) => (
                <div key={d} className={`text-center text-[10px] font-black uppercase tracking-wider mb-2 ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-300'}`}>{d}</div>
              ))}
              {Array.from({ length: getFirstDayOfMonth(currentCalendarMonth.getFullYear(), currentCalendarMonth.getMonth()) }).map((_, i) => <div key={i}></div>)}
              {Array.from({ length: getDaysInMonth(currentCalendarMonth.getFullYear(), currentCalendarMonth.getMonth()) }).map((_, i) => {
                const d = i + 1;
                const date = new Date(currentCalendarMonth.getFullYear(), currentCalendarMonth.getMonth(), d);
                const active = isSameDate(date, selectedDate);
                return (
                  <button key={d} onClick={() => setSelectedDate(date)} className={`aspect-[4/3] rounded-2xl flex items-center justify-center text-sm font-black transition-all ${active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'hover:bg-indigo-50 text-gray-700'}`}>
                    {d}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 오른쪽: 내보내기 도구 */}
          <div className="lg:w-80 space-y-4 pt-4 border-t lg:border-t-0 lg:border-l lg:pl-8 border-gray-100">
            <div className="bg-gray-50/50 p-5 rounded-3xl border border-gray-100">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <p className="text-sm font-bold text-gray-800">엑셀 내려받기</p>
              </div>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">시작일</label>
                  <input type="date" value={exportStartDate} onChange={e => setExportStartDate(e.target.value)} className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none focus:ring-4 focus:ring-indigo-50" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">종료일</label>
                  <input type="date" value={exportEndDate} onChange={e => setExportEndDate(e.target.value)} className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none focus:ring-4 focus:ring-indigo-50" />
                </div>
                <button onClick={handleExport} className="w-full bg-[#10b981] text-white py-3 rounded-xl font-black text-xs hover:bg-[#059669] transition-all shadow-lg shadow-emerald-100 mt-2">
                  기록 추출하기
                </button>
              </div>
            </div>
            <div className="px-2">
              <p className="text-[10px] text-gray-400 font-medium leading-relaxed">
                * 선택된 날짜(<span className="text-indigo-600 font-bold">{selectedDate.toLocaleDateString()}</span>)의 하교 현황이 아래에 표시됩니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 하교 현황 섹션 (모바일에서 한 줄에 1명씩 배치하도록 수정) */}
      <section className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 mb-6">
          <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <h4 className="font-black text-gray-800 text-base uppercase tracking-tight">{selectedDate.getMonth()+1}월 {selectedDate.getDate()}일 하교 현황</h4>
        </div>

        <div className="space-y-10">
          {[1,2,3,4,5,6].map(g => (
            <div key={g} className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                <h5 className="font-black text-gray-800 text-xs">{g}학년</h5>
              </div>
              {/* grid-cols-1로 변경하여 모바일에서 한 줄에 한 명씩 나오도록 수정 */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {studentsByGrade[g]?.map(s => {
                  const record = filteredRecords.find(r => r.studentName === s.name && r.grade === g);
                  const isDone = !!record;
                  return (
                    <div key={s.id} className={`p-4 rounded-xl border transition-all flex items-center group relative ${isDone ? 'bg-indigo-50/50 border-indigo-100 shadow-sm' : 'bg-gray-50/50 border-transparent hover:bg-gray-100'}`}>
                      {/* 왼쪽: 이름 및 하교 방법 */}
                      <div className="flex flex-col flex-[1.5] min-w-0">
                        <p className={`font-black text-[14px] md:text-[15px] ${isDone ? 'text-indigo-900' : 'text-gray-400'}`}>{s.name}</p>
                        <p className={`text-[10px] md:text-[11px] font-bold mt-0.5 ${isDone ? getMethodColor(record.dismissalMethod) : 'text-gray-300'}`}>
                          {isDone ? record.dismissalMethod : '미하교'}
                        </p>
                      </div>

                      {/* 중앙: 하교 시간 */}
                      <div className="flex-1 text-center px-1">
                        <p className={`font-black text-[14px] md:text-[16px] whitespace-nowrap ${isDone ? 'text-gray-900' : 'text-gray-200'}`}>
                          {isDone ? new Date(record.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: true }).replace('AM', '오전').replace('PM', '오후') : '오후 00:00'}
                        </p>
                      </div>

                      {/* 오른쪽: 액션 아이콘 */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {isDone && (
                          <>
                            <button className="p-1.5 text-gray-300 hover:text-indigo-500 transition-all">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </button>
                            <button onClick={() => setDeleteModal({ isOpen: true, type: 'RECORD', id: record.id, name: s.name })} className="p-1.5 text-gray-300 hover:text-red-500 transition-all">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  const renderRoster = () => (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 animate-fade-in max-w-4xl mx-auto">
      {[1,2,3,4,5,6].map(g => (
        <div key={g} className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
          <div className="p-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
            <h4 className="font-black text-gray-900 text-sm">{g}학년 명단</h4>
            <span className="text-[10px] font-bold text-gray-400">{studentsByGrade[g]?.length || 0}명</span>
          </div>
          <div className="p-4 space-y-3 flex-1">
            <div className="flex flex-wrap gap-1.5">
              {studentsByGrade[g]?.map(s => (
                <div key={s.id} className="flex items-center gap-1 bg-gray-50 border border-gray-100 pl-2.5 pr-1 py-0.5 rounded-full group">
                  <span className="text-[11px] font-bold text-gray-700">{s.name}</span>
                  <button onClick={() => setDeleteModal({ isOpen: true, type: 'STUDENT', id: s.id, name: s.name })} className="p-0.5 text-gray-300 hover:text-red-500 rounded-full hover:bg-white transition-all">
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="p-3 bg-white border-t border-gray-50 mt-auto">
            <div className="flex gap-1.5">
              <input type="text" placeholder="이름" value={newStudentName[g] || ''} onChange={e => setNewStudentName({...newStudentName, [g]: e.target.value})} onKeyDown={e => e.key === 'Enter' && handleAddStudent(g)} className="flex-1 bg-gray-50 border-none rounded-xl text-[10px] p-2.5 font-bold" />
              <button onClick={() => handleAddStudent(g)} className="bg-indigo-600 text-white px-3 rounded-xl font-bold text-xs">추가</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#fcfdff] text-gray-800 font-sans pb-20">
      <AdminLoginModal isOpen={showAdminLogin} onClose={() => setShowAdminLogin(false)} value={adminCodeInput} onChange={setAdminCodeInput} onSubmit={handleAdminLogin} />
      <DeleteConfirmModal 
        isOpen={deleteModal.isOpen} 
        onCancel={() => setDeleteModal({ ...deleteModal, isOpen: false })} 
        onConfirm={handleConfirmDelete} 
        title={`${deleteModal.type === 'RECORD' ? '기록' : '명단'} 삭제`} 
        message={`'${deleteModal.name}' 학생의 ${deleteModal.type === 'RECORD' ? '하교 기록을' : '명단 정보를'} 정말 삭제하시겠습니까?`}
        isDeleting={isDeleting}
      />
      
      <header className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg">H</div>
            <div className="flex flex-col"><h1 className="text-base font-black text-gray-900 tracking-tight leading-none">화양초 하교관리</h1></div>
          </div>
          <div className="flex bg-gray-100 p-1 rounded-2xl">
            <button onClick={() => setRole('STUDENT')} className={`px-5 py-2 text-xs font-bold rounded-xl transition-all ${role === 'STUDENT' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}>학생용</button>
            <button onClick={() => { setShowAdminLogin(true); setAdminCodeInput(''); }} className={`px-5 py-2 text-xs font-bold rounded-xl transition-all ${role === 'TEACHER' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}>교사용</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        {role === 'STUDENT' ? (
          <div className="max-w-lg mx-auto space-y-8 animate-fade-in">
            <div className="text-center space-y-2">
              <p className="text-sm font-black text-indigo-600 bg-indigo-50 inline-block px-4 py-1.5 rounded-full">{new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}</p>
              <h2 className="text-3xl font-black text-gray-900 tracking-tight">하교 시간 기록하기</h2>
            </div>
            
            <form onSubmit={handleDismissalSubmit} className="bg-white p-8 rounded-3xl shadow-xl border border-indigo-50 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-[0.2em] px-1">학년</label>
                  <select value={grade} onChange={e => setGrade(Number(e.target.value))} className="w-full p-4 bg-gray-50 border-2 border-transparent rounded-2xl outline-none focus:border-indigo-100 font-bold">
                    {[1,2,3,4,5,6].map(g => <option key={g} value={g}>{g}학년</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-[0.2em] px-1">이름</label>
                  <select value={name} onChange={e => setName(e.target.value)} required className="w-full p-4 bg-gray-50 border-2 border-transparent rounded-2xl outline-none focus:border-indigo-100 font-bold">
                    <option value="">-- 선택 --</option>
                    {studentsByGrade[grade]?.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              {/* 하교 시간 입력란 복구 */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-[0.2em] px-1">하교 시간</label>
                <div className="flex gap-2">
                  <select value={hour} onChange={e => setHour(e.target.value)} className="flex-1 p-4 bg-gray-50 border-2 border-transparent rounded-2xl outline-none focus:border-indigo-100 font-bold">
                    {HOURS.map(h => <option key={h} value={h}>오후 {h}시</option>)}
                  </select>
                  <select value={minute} onChange={e => setMinute(e.target.value)} className="flex-1 p-4 bg-gray-50 border-2 border-transparent rounded-2xl outline-none focus:border-indigo-100 font-bold">
                    {MINUTES.map(m => <option key={m} value={m}>{m}분</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-[0.2em] px-1">하교 방법</label>
                <div className="grid grid-cols-3 gap-2">
                  {DISMISSAL_METHODS.map(m => (
                    <button key={m} type="button" onClick={() => setDismissalMethod(m)} className={`p-3 rounded-xl text-[11px] font-bold transition-all border-2 ${dismissalMethod === m ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100' : 'bg-white text-gray-500 border-gray-100'}`}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <button disabled={loading || !name || hasSubmitted} className={`w-full py-5 rounded-3xl text-white font-black text-xl shadow-2xl transition-all ${hasSubmitted ? 'bg-emerald-500 shadow-emerald-100' : loading || !name ? 'bg-gray-300 shadow-none' : 'bg-indigo-600 shadow-indigo-100 hover:bg-indigo-700'}`}>
                {loading ? '기록 중...' : hasSubmitted ? '✓ 기록 완료' : '제출하기'}
              </button>
            </form>

            <div className="bg-white rounded-[2.5rem] shadow-xl border border-gray-100 overflow-hidden">
              <div className="p-6 bg-gray-50 border-b border-gray-100 font-black text-gray-700 text-sm flex justify-between items-center">
                <span>오늘의 하교 현황</span>
              </div>
              <div className="divide-y divide-gray-50">
                {[1,2,3,4,5,6].map(g => (
                  <div key={g} className="p-6">
                    <h4 className="text-[10px] font-black text-gray-400 mb-4 uppercase tracking-[0.2em]">{g}학년</h4>
                    <div className="flex flex-wrap gap-2">
                      {studentsByGrade[g]?.map(s => {
                        const isDone = records.some(r => r.studentName === s.name && r.grade === g && isSameDate(new Date(r.timestamp), new Date()));
                        return (
                          <span key={s.id} className={`px-4 py-2 rounded-2xl text-[13px] font-bold transition-all ${isDone ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-gray-100 text-gray-300'}`}>
                            {s.name}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-indigo-600 rounded-[2.5rem] shadow-2xl p-8 text-white relative overflow-hidden">
               <div className="flex justify-between items-center mb-6">
                 <h3 className="text-xl font-black">🍱 오늘의 학교 급식</h3>
                 <button onClick={() => loadLunch(true)} disabled={lunchLoading} className={`p-2 bg-white/10 rounded-xl ${lunchLoading ? 'animate-spin' : ''}`}>↻</button>
               </div>
               
               <div className="flex gap-4 items-center mb-6 bg-black/10 p-2 rounded-2xl border border-white/5">
                 <button onClick={() => { const d = new Date(lunchDate); d.setDate(d.getDate()-1); setLunchDate(d); }} className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center font-black transition-colors hover:bg-white/20">◀</button>
                 <div className="flex-1 text-center">
                    <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{lunchDate.getFullYear()}</div>
                    <div className="text-lg font-black">{lunchDate.getMonth() + 1}월 {lunchDate.getDate()}일 ({['일','월','화','수','목','금','토'][lunchDate.getDay()]})</div>
                 </div>
                 <button onClick={() => { const d = new Date(lunchDate); d.setDate(d.getDate()+1); setLunchDate(d); }} className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center font-black transition-colors hover:bg-white/20">▶</button>
               </div>

               <div className="bg-white/10 backdrop-blur-xl p-6 rounded-3xl border border-white/10 min-h-[160px] text-sm leading-relaxed whitespace-pre-wrap">
                  {lunchLoading ? <div className="animate-pulse space-y-3"><div className="h-4 bg-white/20 rounded w-3/4"></div><div className="h-4 bg-white/20 rounded w-full"></div></div> : lunchInfo?.menuText}
               </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6 max-w-4xl mx-auto">
            <div className="flex flex-col gap-1 mb-6">
              <h2 className="text-3xl font-black text-gray-900 tracking-tight">하교 관리자 대시보드</h2>
              <p className="text-gray-400 font-bold text-xs">전교생 하교 현황을 확인하고 데이터를 관리하세요.</p>
            </div>
            
            <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-gray-100 w-fit mb-8">
              <button onClick={() => setTeacherView('DASHBOARD')} className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all ${teacherView === 'DASHBOARD' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-gray-400'}`}>대시보드</button>
              <button onClick={() => setTeacherView('ROSTER')} className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all ${teacherView === 'ROSTER' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-gray-400'}`}>명단 관리</button>
            </div>

            {teacherView === 'DASHBOARD' ? renderDashboard() : renderRoster()}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
