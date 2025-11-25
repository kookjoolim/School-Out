import React, { useState, useEffect } from 'react';
import { DismissalRecord, UserRole, Notification } from './types';
import { generateGoodbyeMessage } from './services/geminiService';
import { db } from './services/firebase';
import { collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc } from 'firebase/firestore';

// Declare SheetJS global
declare const XLSX: any;

// --- Data Constants ---
const STUDENT_DATA: Record<number, string[]> = {
  1: ['김건우', '김하설', '서아인'],
  2: ['김태준', '윤재성', '윤지수', '양혜린'],
  3: ['김온유', '박소윤', '서유인'],
  4: ['강태양', '김다은', '박가은', '심은정', '엄승환', '최은율', '박초연'],
  5: ['서상준', '전지후', '차승환', '임지효'],
  6: ['강려울', '강지온', '박민혁', '박수정', '박시은', '차은애']
};

const DISMISSAL_METHODS = [
  '통학차',
  '에듀택시',
  '시내버스',
  '공부방 차량',
  '부모님 차량'
];

// Constraints for Time Picker
const HOURS = ['1', '2', '3', '4'];
const MINUTES = ['00', '10', '20', '30', '40', '50'];

// --- Helper Functions for Calendar ---
const getDaysInMonth = (year: number, month: number) => {
  return new Date(year, month + 1, 0).getDate();
};

const getFirstDayOfMonth = (year: number, month: number) => {
  return new Date(year, month, 1).getDay();
};

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

// --- Components (Defined outside App to prevent re-render flickering) ---

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  value: string;
  onChange: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

const AdminLoginModal: React.FC<AdminLoginModalProps> = ({ isOpen, onClose, value, onChange, onSubmit }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm animate-fade-in">
        <h3 className="text-xl font-bold text-gray-900 mb-2">관리자 로그인</h3>
        <p className="text-sm text-gray-500 mb-4">선생님 전용 관리자 코드를 입력하세요.</p>
        <form onSubmit={onSubmit}>
          <input 
            type="password" 
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="관리자 코드"
            autoFocus
            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl mb-4 focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          <div className="flex gap-2">
            <button 
              type="button" 
              onClick={onClose}
              className="flex-1 py-3 text-gray-600 font-medium bg-gray-100 rounded-xl hover:bg-gray-200"
            >
              취소
            </button>
            <button 
              type="submit" 
              className="flex-1 py-3 text-white font-bold bg-indigo-600 rounded-xl hover:bg-indigo-700"
            >
              확인
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const NotificationToast = ({ notifications }: { notifications: Notification[] }) => (
  <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
    {notifications.map(n => (
      <div key={n.id} className="bg-white border-l-4 border-green-500 shadow-xl rounded-lg p-4 w-80 transform transition-all duration-500 ease-in-out animate-slide-in pointer-events-auto">
        <div className="flex justify-between items-start">
          <h4 className="font-bold text-gray-800 text-sm">{n.title}</h4>
          <span className="text-xs text-gray-400">방금 전</span>
        </div>
        <p className="text-gray-600 text-sm mt-1">{n.body}</p>
      </div>
    ))}
  </div>
);

function App() {
  // --- State ---
  const [role, setRole] = useState<UserRole>('STUDENT');
  
  // Records state (Managed by Firebase)
  const [records, setRecords] = useState<DismissalRecord[]>([]);

  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [dbError, setDbError] = useState<string | null>(null);
  
  // Student Submission State
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Auth State
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminCodeInput, setAdminCodeInput] = useState('');

  // Form State
  const [grade, setGrade] = useState<number>(1);
  const [name, setName] = useState<string>('');
  const [dismissalMethod, setDismissalMethod] = useState<string>(DISMISSAL_METHODS[0]);
  
  // Time State
  const [hour, setHour] = useState<string>('1');
  const [minute, setMinute] = useState<string>('00');

  // Search State (Teacher)
  const [searchTerm, setSearchTerm] = useState('');
  
  // Calendar State (Teacher)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState<Date>(new Date());

  // Export State (Teacher)
  const [exportStartDate, setExportStartDate] = useState(formatDateForInput(new Date()));
  const [exportEndDate, setExportEndDate] = useState(formatDateForInput(new Date()));

  // Edit State (Teacher)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMethod, setEditMethod] = useState('');
  const [editHour, setEditHour] = useState('1');
  const [editMinute, setEditMinute] = useState('00');

  // Delete Modal State (Teacher)
  const [deleteModal, setDeleteModal] = useState<{isOpen: boolean, id: string | null, name: string}>({
    isOpen: false, id: null, name: ''
  });
  const [isDeleting, setIsDeleting] = useState(false);

  // Date State (Display)
  const [todayDate, setTodayDate] = useState<string>('');

  // --- Effects ---
  
  // Firebase Realtime Listener
  // 앱이 켜지면 Firebase 데이터베이스를 '구독'합니다. 데이터가 바뀌면 즉시 화면을 업데이트합니다.
  useEffect(() => {
    // 쿼리: 하교 기록(dismissals)을 시간 역순(최신순)으로 가져오기
    const q = query(collection(db, "dismissals"), orderBy("timestamp", "desc"));
    
    // 실시간 리스너 연결
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedRecords = snapshot.docs.map(doc => ({
        id: doc.id, // Firestore 문서 ID를 사용
        ...doc.data()
      })) as DismissalRecord[];
      
      setRecords(loadedRecords);
      setDbError(null); // 성공하면 에러 메시지 초기화
    }, (error) => {
      console.error("Firebase 데이터 불러오기 실패:", error);
      if (error.code === 'permission-denied') {
        setDbError("🚨 데이터베이스 접근 권한이 없습니다. Firebase 콘솔 > Firestore Database > [규칙] 탭에서 'allow read, write: if true;'로 설정되어 있는지 확인해주세요.");
      } else {
        setDbError(`데이터 연결 오류: ${error.message}`);
      }
    });

    // 앱 종료(언마운트) 시 리스너 해제
    return () => unsubscribe();
  }, []);

  // Set Today's Date
  useEffect(() => {
    const date = new Date();
    const options: Intl.DateTimeFormatOptions = { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric', 
      weekday: 'long' 
    };
    setTodayDate(date.toLocaleDateString('ko-KR', options));
  }, []);

  // Initialize Name when Grade changes
  useEffect(() => {
    // When grade changes, reset name to empty to force selection
    setName('');
  }, [grade]);

  // Initialize Time on mount (Auto-set logic check)
  useEffect(() => {
    if (DISMISSAL_METHODS[0] === '통학차' || DISMISSAL_METHODS[0] === '에듀택시') {
      setHour('4');
      setMinute('30');
    }
  }, []);

  // --- Actions ---

  const showNotification = (title: string, body: string) => {
    const id = Date.now().toString();
    const newNotif: Notification = { id, title, body, visible: true };
    setNotifications(prev => [...prev, newNotif]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 4000);
  };

  const handleRoleButtonClick = (targetRole: UserRole) => {
    if (targetRole === 'TEACHER') {
      setShowAdminLogin(true);
      setAdminCodeInput('');
    } else {
      setRole('STUDENT');
    }
  };

  const handleAdminLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminCodeInput === 'hy6516') {
      setRole('TEACHER');
      setShowAdminLogin(false);
    } else {
      alert('올바른 관리자 코드를 입력해 주세요.');
      setRole('STUDENT');
      setShowAdminLogin(false);
    }
  };

  const handleMethodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMethod = e.target.value;
    setDismissalMethod(newMethod);
    if (newMethod === '통학차' || newMethod === '에듀택시') {
      setHour('4');
      setMinute('30');
    }
  };

  const handleDismissal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    setLoading(true);
    
    // Generate AI message
    const aiMessage = await generateGoodbyeMessage(name, grade);
    
    const hours24 = parseInt(hour) + 12; 
    const recordDate = new Date();
    recordDate.setHours(hours24, parseInt(minute), 0, 0);

    // 저장할 데이터 준비 (ID는 Firestore가 자동 생성하므로 제외)
    const newRecordData = {
      studentName: name,
      grade: grade,
      dismissalMethod: dismissalMethod,
      timestamp: recordDate.getTime(),
      message: aiMessage
    };

    try {
      // Firebase Firestore에 데이터 추가
      await addDoc(collection(db, "dismissals"), newRecordData);
      
      setHasSubmitted(true); // Disable button
      
      const timeDisplay = recordDate.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      showNotification(
        "📢 하교 기록 저장됨",
        `${name} 학생의 하교 정보가 서버에 저장되었습니다.`
      );

      // Reset button after 2 seconds for the next student
      setTimeout(() => {
        setHasSubmitted(false);
        setName(''); // Clear name to prevent double submission
      }, 2000);

    } catch (error: any) {
      console.error("데이터 저장 실패:", error);
      if (error.code === 'permission-denied') {
        alert("저장 실패: 데이터베이스 쓰기 권한이 없습니다. 선생님께 문의하세요.");
      } else {
        alert("데이터 저장 중 오류가 발생했습니다. 인터넷 연결을 확인해주세요.");
      }
    } finally {
      setLoading(false);
    }
  };

  // --- Edit & Delete Actions (Teacher) ---

  const handleDeleteClick = (e: React.MouseEvent, id: string, studentName: string) => {
    e.stopPropagation(); // Stop event from bubbling
    setDeleteModal({ isOpen: true, id, name: studentName });
  };

  const confirmDelete = async (targetId: string) => {
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, "dismissals", targetId));
      setDeleteModal({ isOpen: false, id: null, name: '' });
    } catch (error: any) {
      console.error("삭제 실패:", error);
      alert(`삭제 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const startEditing = (record: DismissalRecord) => {
    const date = new Date(record.timestamp);
    let h = date.getHours();
    
    // Convert to 12-hour format for the picker mapping
    // Our HOURS list is ['1', '2', '3', '4'] (representing PM)
    if (h > 12) h -= 12; 
    
    setEditingId(record.id);
    setEditMethod(record.dismissalMethod);
    
    // Ensure h matches one of our options, otherwise default to '1'
    const hStr = h.toString();
    setEditHour(HOURS.includes(hStr) ? hStr : '1');
    
    // Find closest 10-minute interval match
    const m = date.getMinutes();
    const mStr = Math.floor(m / 10) * 10;
    const mStrFormatted = mStr === 0 ? '00' : mStr.toString();
    setEditMinute(MINUTES.includes(mStrFormatted) ? mStrFormatted : '00');
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  const saveEditing = async (record: DismissalRecord) => {
    try {
      // Use the existing date to preserve year/month/day correctly
      const targetDate = new Date(record.timestamp);
      
      // Calculate new time components
      // The picker uses '1' for '1 PM' (13:00)
      const selectedPmHour = parseInt(editHour, 10);
      const hours24 = selectedPmHour + 12; 
      const minutes = parseInt(editMinute, 10);

      // Update the time on the date object
      targetDate.setHours(hours24);
      targetDate.setMinutes(minutes);
      targetDate.setSeconds(0);
      targetDate.setMilliseconds(0);

      const recordRef = doc(db, "dismissals", record.id);
      await updateDoc(recordRef, {
        dismissalMethod: editMethod,
        timestamp: targetDate.getTime()
      });

      alert("수정되었습니다.");
      setEditingId(null);
    } catch (error) {
      console.error("수정 실패:", error);
      alert("수정 저장 중 오류가 발생했습니다.");
    }
  };

  const handleExcelExport = () => {
    if (typeof XLSX === 'undefined') {
      alert('엑셀 라이브러리가 로드되지 않았습니다. 페이지를 새로고침 해주세요.');
      return;
    }

    if (records.length === 0) {
      alert('내보낼 기록이 없습니다.');
      return;
    }

    const start = new Date(exportStartDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(exportEndDate);
    end.setHours(23, 59, 59, 999);

    const targetRecords = records.filter(r => {
      const t = new Date(r.timestamp);
      return t >= start && t <= end;
    });

    if (targetRecords.length === 0) {
      alert('선택한 기간에 해당하는 기록이 없습니다.');
      return;
    }

    // Sort by timestamp
    targetRecords.sort((a, b) => b.timestamp - a.timestamp);

    // Format data for Excel
    const excelData = targetRecords.map(r => ({
      '날짜': new Date(r.timestamp).toLocaleDateString('ko-KR'),
      '시간': new Date(r.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      '학년': `${r.grade}학년`,
      '이름': r.studentName,
      '하교방법': r.dismissalMethod,
      '메시지': r.message
    }));

    // Create workbook and sheet
    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "하교기록");

    // Adjust column widths
    const wscols = [
      {wch: 15}, // 날짜
      {wch: 10}, // 시간
      {wch: 8},  // 학년
      {wch: 10}, // 이름
      {wch: 15}, // 하교방법
      {wch: 40}, // 메시지
    ];
    ws['!cols'] = wscols;

    // Download file
    XLSX.writeFile(wb, `하교기록_${exportStartDate}_${exportEndDate}.xlsx`);
  };

  // --- Filtering & Calendar Logic ---
  
  // Filter for Search (Existing functionality)
  const filteredRecords = records.filter(r => 
    r.studentName.includes(searchTerm)
  );

  // Calendar Navigation
  const handlePrevMonth = () => {
    setCurrentCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };
  
  const handleNextMonth = () => {
    setCurrentCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  // Generate Calendar Days
  const generateCalendarDays = () => {
    const year = currentCalendarMonth.getFullYear();
    const month = currentCalendarMonth.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    
    const days = [];
    // Empty slots for previous month
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-10"></div>);
    }
    // Days
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const isSelected = isSameDate(date, selectedDate);
      const isToday = isSameDate(date, new Date());
      
      days.push(
        <button
          key={d}
          type="button"
          onClick={() => setSelectedDate(date)}
          className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-medium transition-all
            ${isSelected ? 'bg-indigo-600 text-white shadow-md' : 'hover:bg-indigo-50 text-gray-700'}
            ${isToday && !isSelected ? 'border-2 border-indigo-400 font-bold' : ''}
          `}
        >
          {d}
        </button>
      );
    }
    return days;
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans pb-20">
      <NotificationToast notifications={notifications} />
      <AdminLoginModal 
        isOpen={showAdminLogin} 
        onClose={() => setShowAdminLogin(false)}
        value={adminCodeInput}
        onChange={setAdminCodeInput}
        onSubmit={handleAdminLoginSubmit}
      />
      
      {/* Header / Role Switcher */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold">S</div>
            <h1 className="text-xl font-bold text-gray-900">화양초등학교 하교시간 기록 앱</h1>
          </div>
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button 
              type="button"
              onClick={() => handleRoleButtonClick('STUDENT')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${role === 'STUDENT' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              학생용
            </button>
            <button 
              type="button"
              onClick={() => handleRoleButtonClick('TEACHER')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${role === 'TEACHER' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              교사용
            </button>
          </div>
        </div>
      </header>

      {/* DB Connection Error Banner */}
      {dbError && (
        <div className="bg-red-50 border-b border-red-200 p-4">
          <div className="max-w-4xl mx-auto flex items-start gap-3">
            <svg className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="text-sm text-red-800 font-medium">
              {dbError}
            </div>
          </div>
        </div>
      )}

      <main className="max-w-4xl mx-auto px-4 py-8">
        
        {/* ============ STUDENT VIEW ============ */}
        {role === 'STUDENT' && (
          <div className="max-w-md mx-auto space-y-6">
            <div className="text-center space-y-2 mb-8">
              {/* Date Display */}
              <p className="text-sm font-semibold text-indigo-600 bg-indigo-50 inline-block px-3 py-1 rounded-full mb-1">
                {todayDate}
              </p>
              <h2 className="text-2xl font-bold text-gray-900">하교 시간 기록하기</h2>
              <p className="text-gray-500">정보를 선택하고 제출하기 버튼을 눌러주세요.</p>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <form onSubmit={handleDismissal} className="space-y-4">
                {/* Row 1: Grade and Name */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">학년</label>
                    <select 
                      value={grade} onChange={(e) => setGrade(parseInt(e.target.value))}
                      className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    >
                      {[1,2,3,4,5,6].map(g => <option key={g} value={g}>{g}학년</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">이름</label>
                    <select 
                      value={name} onChange={(e) => setName(e.target.value)}
                      className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    >
                      <option value="">-- 이름 선택 --</option>
                      {STUDENT_DATA[grade]?.map(studentName => (
                        <option key={studentName} value={studentName}>{studentName}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Row 2: Method and Time */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">하교 방법</label>
                    <select 
                      value={dismissalMethod} onChange={handleMethodChange}
                      className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    >
                      {DISMISSAL_METHODS.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">하교 시간</label>
                    {/* Custom Time Picker Component */}
                    <div className="w-full bg-gray-50 border border-gray-200 rounded-xl flex items-center overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all">
                      {/* Icon */}
                      <div className="pl-4 py-3 flex-shrink-0 flex items-center">
                        <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                      </div>

                      {/* "오후" Text Centered */}
                      <div className="px-3 flex-shrink-0 flex items-center justify-center">
                        <span className="text-sm font-bold text-gray-600">오후</span>
                      </div>
                      
                      {/* Time Selector Area */}
                      <div className="flex-1 flex items-center min-w-0">
                        {/* Hour */}
                        <div className="flex-1 relative min-w-0">
                          <select 
                            value={hour} 
                            onChange={(e) => setHour(e.target.value)}
                            className="w-full py-3 bg-transparent outline-none appearance-none text-center font-bold text-gray-800 min-w-0"
                          >
                            {HOURS.map(h => <option key={h} value={h}>{h}시</option>)}
                          </select>
                        </div>
                        
                        <div className="text-gray-400 font-bold flex-shrink-0 px-1">:</div>
                        
                        {/* Minute */}
                        <div className="flex-1 relative min-w-0">
                          <select 
                            value={minute} 
                            onChange={(e) => setMinute(e.target.value)}
                            className="w-full py-3 bg-transparent outline-none appearance-none text-center font-bold text-gray-800 min-w-0"
                          >
                            {MINUTES.map(m => <option key={m} value={m}>{m}분</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <button 
                  type="submit" 
                  disabled={loading || !name || hasSubmitted}
                  className={`w-full py-4 rounded-xl text-white font-bold text-lg shadow-lg transform transition-all 
                    ${hasSubmitted 
                      ? 'bg-green-500 scale-100' // Success State
                      : loading || !name 
                        ? 'bg-indigo-300 cursor-not-allowed scale-100 shadow-none' 
                        : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-200 active:scale-95'
                    }`}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      처리중...
                    </span>
                  ) : hasSubmitted ? '제출완료 (2초 후 초기화)' : '제출하기'}
                </button>
              </form>
            </div>

            {/* Roster Status View (Always visible below form for overview) */}
             <div className="mt-8 animate-fade-in">
               <div className="text-center mb-6">
                 <h3 className="text-lg font-bold text-gray-900">오늘의 하교 현황</h3>
                 <p className="text-gray-500 text-xs mt-1">이름이 보라색으로 칠해진 친구는 하교를 완료한 친구입니다.</p>
               </div>

               <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                 <div className="divide-y divide-gray-100">
                   {[1, 2, 3, 4, 5, 6].map(g => (
                     <div key={g} className="p-4">
                       <h4 className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wider">{g}학년</h4>
                       <div className="grid grid-cols-3 gap-2">
                         {STUDENT_DATA[g].map(sName => {
                           const isDone = records.some(r => r.studentName === sName && isSameDate(new Date(r.timestamp), new Date()));
                           return (
                             <div key={sName} className={`py-2 px-1 rounded-lg text-center text-sm border transition-colors ${isDone ? 'bg-indigo-100 border-indigo-200 text-indigo-700 font-bold shadow-sm' : 'bg-gray-50 border-gray-100 text-gray-400'}`}>
                               {sName}
                             </div>
                           );
                         })}
                       </div>
                     </div>
                   ))}
                 </div>
               </div>
             </div>
          </div>
        )}

        {/* ============ TEACHER VIEW ============ */}
        {role === 'TEACHER' && (
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-end gap-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">하교 관리자 대시보드</h2>
                <p className="text-gray-500">전교생 하교 현황을 확인하고 데이터를 관리하세요.</p>
              </div>
            </div>

            {/* Management Tools (Export) */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <h3 className="text-lg font-bold text-gray-800">관리 도구</h3>
                </div>
              </div>
              
              <div className="space-y-4">
                {/* Export Section */}
                <div className="bg-gray-50 p-4 rounded-xl">
                  <h4 className="text-sm font-bold text-gray-700 mb-3">데이터 내보내기 (Excel)</h4>
                  <div className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-1 w-full">
                      <label className="block text-xs font-medium text-gray-500 mb-1">시작일</label>
                      <input 
                        type="date" 
                        value={exportStartDate} 
                        onChange={e => setExportStartDate(e.target.value)}
                        className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="flex-1 w-full">
                      <label className="block text-xs font-medium text-gray-500 mb-1">종료일</label>
                      <input 
                        type="date" 
                        value={exportEndDate} 
                        onChange={e => setExportEndDate(e.target.value)}
                        className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <button 
                      type="button"
                      onClick={handleExcelExport}
                      className="w-full md:w-auto px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      엑셀 다운로드
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Calendar Widget */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <button type="button" onClick={handlePrevMonth} className="p-1 hover:bg-gray-100 rounded-full text-gray-500">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <h3 className="text-lg font-bold text-gray-800">
                    {currentCalendarMonth.getFullYear()}년 {currentCalendarMonth.getMonth() + 1}월
                  </h3>
                  <button type="button" onClick={handleNextMonth} className="p-1 hover:bg-gray-100 rounded-full text-gray-500">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                  </button>
                </div>
                <div className="text-sm text-gray-500">
                  선택된 날짜: <span className="text-indigo-600 font-bold">{selectedDate.toLocaleDateString('ko-KR')}</span>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center mb-2">
                {['일', '월', '화', '수', '목', '금', '토'].map(day => (
                  <div key={day} className="text-xs font-medium text-gray-400 py-1">{day}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1 place-items-center">
                {generateCalendarDays()}
              </div>
            </div>

            {/* Daily Dismissal Report */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
               <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                 <h3 className="font-bold text-gray-800 flex items-center gap-2">
                   <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                   </svg>
                   {selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일 하교 현황
                 </h3>
               </div>
               
               <div className="divide-y divide-gray-100">
                 {[1, 2, 3, 4, 5, 6].map(gradeLevel => (
                   <div key={gradeLevel} className="p-6">
                     <h4 className="text-sm font-bold text-gray-500 mb-4 flex items-center gap-2">
                       <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                       {gradeLevel}학년
                     </h4>
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                       {STUDENT_DATA[gradeLevel].map(studentName => {
                         // Find record for this student on the selected date
                         const record = records.find(r => 
                           r.studentName === studentName && 
                           r.grade === gradeLevel &&
                           isSameDate(new Date(r.timestamp), selectedDate)
                         );

                         if (record) {
                           // Is Editing?
                           const isEditing = editingId === record.id;
                           
                           return (
                             <div key={studentName} className={`rounded-lg p-3 border transition-colors group ${isEditing ? 'bg-white border-indigo-400 ring-2 ring-indigo-100' : 'bg-indigo-50 border-indigo-100'}`}>
                               
                               {isEditing ? (
                                 // --- EDIT MODE ---
                                 <div className="space-y-2">
                                   <div className="flex justify-between items-center mb-2">
                                      <span className="font-bold text-gray-900">{studentName}</span>
                                      <span className="text-xs text-indigo-500 font-bold">수정 중...</span>
                                   </div>
                                   <select 
                                     value={editMethod} 
                                     onChange={(e) => setEditMethod(e.target.value)}
                                     className="w-full p-1.5 text-xs border rounded mb-1 bg-white"
                                   >
                                     {DISMISSAL_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                                   </select>
                                   <div className="flex gap-1 items-center">
                                      <select value={editHour} onChange={(e) => setEditHour(e.target.value)} className="p-1 text-xs border rounded bg-white">
                                        {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                                      </select>
                                      <span className="text-gray-400">:</span>
                                      <select value={editMinute} onChange={(e) => setEditMinute(e.target.value)} className="p-1 text-xs border rounded bg-white">
                                        {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
                                      </select>
                                   </div>
                                   <div className="flex gap-2 mt-2 pt-2 border-t border-gray-100">
                                     <button type="button" onClick={() => saveEditing(record)} className="flex-1 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700">저장</button>
                                     <button type="button" onClick={cancelEditing} className="flex-1 py-1 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300">취소</button>
                                   </div>
                                 </div>
                               ) : (
                                 // --- VIEW MODE ---
                                 <div className="flex justify-between items-center">
                                   <div>
                                     <div className="font-bold text-gray-900">{studentName}</div>
                                     <div className={`text-xs mt-1 ${(record.dismissalMethod === '통학차' || record.dismissalMethod === '에듀택시') ? 'text-red-600 font-bold' : 'text-indigo-600'}`}>
                                       {record.dismissalMethod}
                                     </div>
                                   </div>
                                   <div className="text-right flex items-center gap-3">
                                     <div className="text-lg font-bold text-gray-800">
                                       {new Date(record.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                                     </div>
                                     <div className="flex gap-1">
                                        <button
                                          type="button"
                                          onClick={() => startEditing(record)}
                                          className="p-1.5 text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-md transition-colors relative z-10"
                                          title="기록 수정"
                                        >
                                          <svg className="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                          </svg>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => handleDeleteClick(e, record.id, record.studentName)}
                                          className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors relative z-20 cursor-pointer"
                                          title="기록 삭제"
                                        >
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                          </svg>
                                        </button>
                                     </div>
                                   </div>
                                 </div>
                               )}
                             </div>
                           );
                         } else {
                           // Student hasn't dismissed yet
                           return (
                             <div key={studentName} className="bg-gray-50 rounded-lg p-3 border border-gray-100 flex justify-between items-center opacity-75">
                               <div>
                                 <div className="font-medium text-gray-500">{studentName}</div>
                                 <div className="text-xs text-gray-400 mt-1">-</div>
                               </div>
                               <div className="text-xs text-gray-400 bg-gray-200 px-2 py-1 rounded">
                                 미하교
                               </div>
                             </div>
                           );
                         }
                       })}
                     </div>
                   </div>
                 ))}
               </div>
            </div>

          </div>
        )}
      </main>

      {/* Delete Confirmation Modal (Inlined for stability) */}
      {deleteModal.isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center px-4 animate-fade-in" 
          onClick={() => !isDeleting && setDeleteModal(prev => ({...prev, isOpen: false}))}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm transform transition-all scale-100" 
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                {isDeleting ? (
                   <svg className="animate-spin h-6 w-6 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                     <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                     <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                   </svg>
                ) : (
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">기록 삭제 확인</h3>
                <p className="text-gray-600 text-sm mt-1">
                  <span className="font-bold text-indigo-600">{deleteModal.name}</span> 학생의 하교 기록을 정말로 삭제하시겠습니까?
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-2">
              <button 
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteModal(prev => ({...prev, isOpen: false}))}
                className="flex-1 py-3 text-gray-600 font-medium bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                취소
              </button>
              <button 
                type="button"
                disabled={isDeleting || !deleteModal.id}
                onClick={(e) => {
                  e.stopPropagation();
                  if (deleteModal.id) confirmDelete(deleteModal.id);
                }}
                className="flex-1 py-3 text-white font-bold bg-red-500 rounded-xl hover:bg-red-600 shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center"
              >
                {isDeleting ? '삭제 중...' : '삭제하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;