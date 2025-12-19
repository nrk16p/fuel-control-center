
"use client";

import { useState, useRef, useEffect } from "react";

export const DateRange = ({ value, onChange, placeholder, className, ...props } : any) => {
    const [isOpen, setIsOpen] = useState(false);
    const [startDate, setStartDate] = useState<Date | "">("");
    const [endDate, setEndDate] = useState<Date | "">("");
    const [tempStartDate, setTempStartDate] = useState<Date | "">("");
    const [tempEndDate, setTempEndDate] = useState<Date | "">("");
    const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    const dropdownRef = useRef(null);

    useEffect(() => {
        if (value && value.from && value.to) {
            setStartDate(value.from);
            setEndDate(value.to);
            setTempStartDate(value.from);
            setTempEndDate(value.to);
        }
    }, [value]);

    const months = [
        "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
        "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
    ];

    const days = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !(dropdownRef.current as any).contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const formatDate = (date: Date) => {
        if (!date) return "";
        const d = new Date(date);
        return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
    };

    const getDisplayValue = () => {
        if (startDate && endDate) {
            return `${formatDate(startDate)} - ${formatDate(endDate)}`;
        } else if (startDate) {
            return formatDate(startDate);
        }
        return "";
    };

    const handleDateClick = (day: number) => {
        const clickedDate = new Date(currentYear, currentMonth, day);
        
        if (!tempStartDate || (tempStartDate && tempEndDate)) {
            setTempStartDate(clickedDate);
            setTempEndDate("");
        } else if (tempStartDate && !tempEndDate) {
            if (clickedDate >= tempStartDate) {
                setTempEndDate(clickedDate);
            } else {
                setTempStartDate(clickedDate);
                setTempEndDate("");
            }
        }
    };

    const applyDateRange = () => {
        setStartDate(tempStartDate);
        setEndDate(tempEndDate);
        
        if (onChange) {
            onChange({
                from: tempStartDate,
                to: tempEndDate
            });
        }
        
        setIsOpen(false);
    };

    const clearSelection = () => {
        setStartDate("");
        setEndDate("");
        setTempStartDate("");
        setTempEndDate("");
        if (onChange) {
            onChange({
                from: null,
                to: null
            });
        }
    };

    const getDaysInMonth = (month: number, year: number) => {
        return new Date(year, month + 1, 0).getDate();
    };

    const getFirstDayOfMonth = (month: number, year: number) => {
        return new Date(year, month, 1).getDay();
    };

    const isDateInRange = (day: number) => {
        if (!tempStartDate) return false;
        const date = new Date(currentYear, currentMonth, day);
        
        if (tempStartDate && tempEndDate) {
            return date >= tempStartDate && date <= tempEndDate;
        } else if (tempStartDate) {
            return date.getTime() === tempStartDate.getTime();
        }
        return false;
    };

    const isStartDate = (day: number) => {
        if (!tempStartDate) return false;
        const date = new Date(currentYear, currentMonth, day);
        return date.getTime() === tempStartDate.getTime();
    };

    const isEndDate = (day: number) => {
        if (!tempEndDate) return false;
        const date = new Date(currentYear, currentMonth, day);
        return date.getTime() === tempEndDate.getTime();
    };

    const renderCalendar = () => {
        const daysInMonth = getDaysInMonth(currentMonth, currentYear);
        const firstDay = getFirstDayOfMonth(currentMonth, currentYear);
        const calendarDays = [];

        // Empty cells for days before the first day of the month
        for (let i = 0; i < firstDay; i++) {
            calendarDays.push(<div key={`empty-${i}`} className="w-8 h-8"></div>);
        }

        // Days of the month
        for (let day = 1; day <= daysInMonth; day++) {
            const isInRange = isDateInRange(day);
            const isStart = isStartDate(day);
            const isEnd = isEndDate(day);
            
            calendarDays.push(
                <button
                    key={day}
                    type="button"
                    onClick={() => handleDateClick(day)}
                    className={`w-8 h-8 text-sm rounded transition-colors ${
                        isInRange
                            ? isStart || isEnd
                                ? "bg-blue-500 text-white"
                                : "bg-blue-100 text-blue-800"
                            : "text-gray-700 hover:bg-gray-100"
                    }`}
                >
                    {day}
                </button>
            );
        }

        return calendarDays;
    };

    return (
        <div className="relative" ref={dropdownRef} style={{ zIndex: 99999 }}>
            <input
                type="text"
                readOnly
                value={getDisplayValue()}
                onClick={() => setIsOpen(!isOpen)}
                placeholder={placeholder || "เลือกช่วงวันที่"}
                className={className}
                {...props}
            />
            {/* <div className="absolute top-0 right-0 px-3 py-2 pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
            </div> */}

            {isOpen && (
                <div 
                    className="relative top-full left-0 mt-1 bg-white rounded-lg shadow-lg border p-4 w-80"
                    style={{ zIndex: 99999 }}
                >
                    {/* Header */}
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center space-x-2">
                            <span className="font-semibold text-gray-800">
                                {months[currentMonth]} {currentYear}
                            </span>
                        </div>
                        <div className="flex space-x-1">
                            <button
                                type="button"
                                onClick={() => {
                                    if (currentMonth === 0) {
                                        setCurrentMonth(11);
                                        setCurrentYear(currentYear - 1);
                                    } else {
                                        setCurrentMonth(currentMonth - 1);
                                    }
                                }}
                                className="p-1 rounded hover:bg-gray-100"
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"/>
                                </svg>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (currentMonth === 11) {
                                        setCurrentMonth(0);
                                        setCurrentYear(currentYear + 1);
                                    } else {
                                        setCurrentMonth(currentMonth + 1);
                                    }
                                }}
                                className="p-1 rounded hover:bg-gray-100"
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/>
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Days of week header */}
                    <div className="grid grid-cols-7 gap-1 mb-2">
                        {days.map((day) => (
                            <div key={day} className="text-center text-xs font-semibold text-gray-500 py-2">
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Calendar */}
                    <div className="grid grid-cols-7 gap-1 mb-4">
                        {renderCalendar()}
                    </div>

                    {/* Action buttons */}
                    <div className="flex justify-between space-x-2">
                        <button
                            type="button"
                            onClick={clearSelection}
                            className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded"
                        >
                            ล้าง
                        </button>
                        <div className="flex space-x-2">
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded"
                            >
                                ยกเลิก
                            </button>
                            <button
                                type="button"
                                onClick={applyDateRange}
                                className="px-3 py-2 text-sm text-white bg-blue-500 hover:bg-blue-600 rounded"
                            >
                                เลือก
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};