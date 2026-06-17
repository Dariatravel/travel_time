'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CreateOperatorForm } from '@/features/AdminOperators/ui/CreateOperatorForm';
import { Loader } from '@/shared';
import { useGetOperators } from '@/shared/api/admin/operators';
import { PagesEnum, routes } from '@/shared/config/routes';
import { isAdminRole } from '@/shared/lib/isAdmin';
import { $user } from '@/shared/models/auth';
import { useUnit } from 'effector-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export const OperatorsAdminPage = () => {
    const user = useUnit($user);
    const router = useRouter();
    const { data: operators, isLoading, isError, error, refetch } = useGetOperators(
        Boolean(user && isAdminRole(user.role)),
    );

    useEffect(() => {
        if (user && !isAdminRole(user.role)) {
            router.replace(routes[PagesEnum.MAIN]);
        }
    }, [user, router]);

    if (!user || !isAdminRole(user.role)) {
        return (
            <div className="flex justify-center items-center min-h-[320px]">
                <Loader />
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto space-y-6 py-4">
            <div>
                <h1 className="text-2xl font-semibold">Операторы</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Создание учётных записей операторов для входа в систему.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Новый оператор</CardTitle>
                    <CardDescription>
                        Email и пароль передаются оператору для входа на странице «Вход».
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <CreateOperatorForm />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Список операторов</CardTitle>
                    <CardDescription>
                        Все пользователи с ролью «Оператор» в системе.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading && (
                        <div className="flex justify-center py-8">
                            <Loader />
                        </div>
                    )}

                    {isError && (
                        <p className="text-sm text-red-600">
                            {(error as Error)?.message || 'Не удалось загрузить список операторов'}
                        </p>
                    )}

                    {!isLoading && !isError && operators?.length === 0 && (
                        <p className="text-sm text-muted-foreground">Операторы пока не добавлены.</p>
                    )}

                    {!isLoading && !isError && operators && operators.length > 0 && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left">
                                        <th className="py-2 pr-4 font-medium">Фамилия</th>
                                        <th className="py-2 pr-4 font-medium">Имя</th>
                                        <th className="py-2 pr-4 font-medium">Email</th>
                                        <th className="py-2 pr-4 font-medium">Телефон</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {operators.map((operator) => (
                                        <tr key={operator.id} className="border-b last:border-0">
                                            <td className="py-3 pr-4">{operator.surname || '—'}</td>
                                            <td className="py-3 pr-4">{operator.name || '—'}</td>
                                            <td className="py-3 pr-4">{operator.email}</td>
                                            <td className="py-3 pr-4">{operator.phone || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {isError && (
                        <button
                            type="button"
                            className="mt-4 text-sm text-primary underline"
                            onClick={() => refetch()}
                        >
                            Повторить загрузку
                        </button>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};
