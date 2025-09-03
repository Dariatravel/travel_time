'use client';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import cx from 'classnames';
import React from 'react';
import { FilterSection as FilterSectionType } from '../lib/types';
import { FilterTag } from './FilterTag';

interface FilterSectionProps {
    /** Секция фильтра */
    section: FilterSectionType;
    /** Обработчик изменения состояния опции */
    onOptionToggle: (sectionId: string, optionId: string) => void;
    /** Дополнительные CSS классы */
    className?: string;
}

/**
 * Компонент секции фильтра
 * Отображает раскрывающуюся секцию с заголовком и тегами фильтров
 */
export const FilterSection: React.FC<FilterSectionProps> = ({
    section,
    onOptionToggle,
    className,
}) => {
    const handleOptionToggle = (optionId: string) => {
        onOptionToggle(section.id, optionId);
    };

    const activeOptionsCount = section.options.filter((option) => option.isActive).length;

    return (
        <Accordion
            type="single"
            collapsible
            defaultValue={section.isExpanded ? section.id : undefined}
            className={cx('w-full', className)}
        >
            <AccordionItem value={section.id} className="border-b border-border/50">
                <AccordionTrigger className="hover:no-underline group">
                    <div className="flex items-center justify-between w-full pr-4">
                        <span className="text-base font-semibold text-foreground">
                            {section.title}
                        </span>
                        {activeOptionsCount > 0 && (
                            <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded-full">
                                {activeOptionsCount}
                            </span>
                        )}
                    </div>
                </AccordionTrigger>
                <AccordionContent className="pt-4 pb-2">
                    <div className="flex flex-wrap gap-2">
                        {section.options.map((option) => (
                            <FilterTag
                                key={option.id}
                                option={option}
                                onToggle={handleOptionToggle}
                            />
                        ))}
                    </div>
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    );
};
