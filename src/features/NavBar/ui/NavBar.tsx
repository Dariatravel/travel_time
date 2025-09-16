'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    NavigationMenu,
    NavigationMenuItem,
    NavigationMenuList,
} from '@/components/ui/navigation-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ChevronDownIcon, HamburgerIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import * as React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { getActiveStatus } from '../lib/getActiveStatus';

// User Menu Component
const UserMenu = ({
    userName = 'John Doe',
    userEmail = 'john@example.com',
    userAvatar,
    onItemClick,
}: {
    userName?: string;
    userEmail?: string;
    userAvatar?: string;
    onItemClick?: (item: string) => void;
}) => (
    <DropdownMenu>
        <DropdownMenuTrigger asChild>
            <Button
                variant="ghost"
                className="h-8 px-2 py-0 hover:bg-accent hover:text-accent-foreground"
            >
                <Avatar className="h-6 w-6">
                    <AvatarImage src={userAvatar} alt={userName} />
                    <AvatarFallback className="text-xs">
                        {userName
                            .split(' ')
                            .map((n) => n[0])
                            .join('')}
                    </AvatarFallback>
                </Avatar>
                <ChevronDownIcon className="h-3 w-3 ml-1" />
                <span className="sr-only">User menu</span>
            </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{userName}</p>
                    <p className="text-xs leading-none text-muted-foreground">{userEmail}</p>
                </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onItemClick?.('profile')}>Profile</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onItemClick?.('settings')}>Settings</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onItemClick?.('billing')}>Billing</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onItemClick?.('logout')}>Log out</DropdownMenuItem>
        </DropdownMenuContent>
    </DropdownMenu>
);

// Types
export interface NavbarNavItem {
    href: string;
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>;
    active?: boolean;
}

export interface NavbarProps extends React.HTMLAttributes<HTMLElement> {
    navigationLinks?: NavbarNavItem[];
    userName?: string;
    userEmail?: string;
    userAvatar?: string;
    onNavItemClick?: (href: string) => void;
    onUserItemClick?: (item: string) => void;
}

// Default navigation links with icons

export const Navbar = React.forwardRef<HTMLElement, NavbarProps>(
    (
        {
            className,
            navigationLinks = [],
            userName = 'John Doe',
            userEmail = 'john@example.com',
            userAvatar,
            onNavItemClick,
            onUserItemClick,
            ...props
        },
        ref,
    ) => {
        const [isMobile, setIsMobile] = useState(false);
        const containerRef = useRef<HTMLElement>(null);
        const pathname = usePathname();

        const params = useParams();
        const selectId = useId();

        useEffect(() => {
            const checkWidth = () => {
                if (containerRef.current) {
                    const width = containerRef.current.offsetWidth;
                    setIsMobile(width < 768); // 768px is md breakpoint
                }
            };

            checkWidth();

            const resizeObserver = new ResizeObserver(checkWidth);
            if (containerRef.current) {
                resizeObserver.observe(containerRef.current);
            }

            return () => {
                resizeObserver.disconnect();
            };
        }, []);

        // Combine refs
        const combinedRef = React.useCallback(
            (node: HTMLElement | null) => {
                containerRef.current = node;
                if (typeof ref === 'function') {
                    ref(node);
                } else if (ref) {
                    ref.current = node;
                }
            },
            [ref],
        );

        return (
            <header
                ref={combinedRef}
                className={cn(
                    'sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6 [&_*]:no-underline',
                    className,
                )}
                {...props}
            >
                <div className="container mx-auto flex h-16 max-w-screen-2xl items-center justify-between gap-4">
                    {/* Left side */}
                    <div className="flex flex-1 items-center gap-2">
                        {/* Mobile menu trigger */}
                        {isMobile && (
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        className="group h-8 w-8 hover:bg-accent hover:text-accent-foreground"
                                        variant="ghost"
                                        size="icon"
                                    >
                                        <HamburgerIcon />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent align="start" className="w-64 p-1">
                                    <NavigationMenu className="max-w-none">
                                        <NavigationMenuList className="flex-col items-start gap-0">
                                            {navigationLinks.map((link, index) => {
                                                const Icon = link.icon;
                                                const isActive = getActiveStatus(
                                                    link.href,
                                                    params,
                                                    pathname,
                                                );

                                                console.log('link', { link, isActive });
                                                return (
                                                    <NavigationMenuItem
                                                        key={index}
                                                        className="w-full"
                                                    >
                                                        <Link
                                                            href={link?.href}
                                                            className={cn(
                                                                'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer no-underline',
                                                                isActive &&
                                                                    'bg-accent text-accent-foreground',
                                                            )}
                                                            // className={`${cx.link} ${isActive ? cx.active : ''}`}
                                                            key={index}
                                                            prefetch={false}
                                                        >
                                                            <Icon
                                                                size={16}
                                                                className="text-muted-foreground"
                                                                aria-hidden={true}
                                                            />
                                                            <span>{link.label}</span>
                                                        </Link>
                                                    </NavigationMenuItem>
                                                );
                                            })}
                                        </NavigationMenuList>
                                    </NavigationMenu>
                                </PopoverContent>
                            </Popover>
                        )}
                        <div className="flex items-center gap-6">
                            {!isMobile && (
                                <NavigationMenu className="flex">
                                    <NavigationMenuList className="">
                                        <TooltipProvider>
                                            {navigationLinks.map((link) => {
                                                const Icon = link.icon;
                                                const isActive = getActiveStatus(
                                                    link.href,
                                                    params,
                                                    pathname,
                                                );
                                                return (
                                                    <NavigationMenuItem key={link.label}>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Link
                                                                    href={link.href}
                                                                    className={cn(
                                                                        'flex items-center border border-transparent justify-center p-2.5 rounded-md transition-colors hover:border hover:border-gray-200 cursor-pointer',
                                                                        isActive &&
                                                                            'border border-gray-200 bg-accent text-accent-foreground',
                                                                    )}
                                                                >
                                                                    <Icon
                                                                        size={20}
                                                                        aria-hidden={true}
                                                                    />
                                                                    <span className="sr-only">
                                                                        {link.label}
                                                                    </span>
                                                                </Link>
                                                            </TooltipTrigger>
                                                            <TooltipContent
                                                                side="bottom"
                                                                className="px-2 py-1 text-xs"
                                                            >
                                                                <p>{link.label}</p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </NavigationMenuItem>
                                                );
                                            })}
                                        </TooltipProvider>
                                    </NavigationMenuList>
                                </NavigationMenu>
                            )}
                        </div>
                    </div>
                    {/* Right side */}
                    <div className="flex items-center gap-2">
                        {/* User menu */}
                        <UserMenu
                            userName={userName}
                            userEmail={userEmail}
                            userAvatar={userAvatar}
                            onItemClick={onUserItemClick}
                        />
                    </div>
                </div>
            </header>
        );
    },
);

Navbar.displayName = 'Navbar';

export { HamburgerIcon, UserMenu };
