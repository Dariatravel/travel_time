'use client';
import React from 'react';
import { ToastContainer } from 'react-toastify';

export interface LayoutProps {
    children?: React.ReactNode;
}

export default function MainLayout({ children }: LayoutProps) {
    return (
        <div className="min-h-screen bg-white">
            <div className="min-h-screen flex items-center justify-center">
                <ToastContainer />
                {children}
            </div>
        </div>
    );
}
