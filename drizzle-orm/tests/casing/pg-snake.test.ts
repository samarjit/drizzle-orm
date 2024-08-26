import { beforeEach, describe, it } from 'vitest';
import { drizzle } from '~/postgres-js';
import { alias, boolean, integer, pgSchema, pgTable, serial, text, union } from '~/pg-core';
import { asc, eq, sql } from '~/sql';
import postgres from 'postgres';

const db = drizzle(postgres(''), { casing: 'camelCase' });

const testSchema = pgSchema('test');
const users = pgTable('users', {
  id: serial().primaryKey(),
  first_name: text().notNull(),
  last_name: text().notNull(),
  // Test that custom aliases remain
  age: integer('AGE')
});
const developers = testSchema.table('developers', {
  user_id: serial().primaryKey().references(() => users.id),
  uses_drizzle_orm: boolean().notNull(),
});
const devs = alias(developers, 'devs');

const usersCache = {
  'public.users.id': 'id',
  'public.users.first_name': 'firstName',
  'public.users.last_name': 'lastName',
  'public.users.AGE': 'age',
};
const developersCache = {
  'test.developers.user_id': 'userId',
  'test.developers.uses_drizzle_orm': 'usesDrizzleOrm',
};
const cache = {
  ...usersCache,
  ...developersCache,
};

const fullName = sql`${users.first_name} || ' ' || ${users.last_name}`.as('name');

describe('postgres snake case to camel case ', () => {
  beforeEach(() => {
    db.dialect.casing.clearCache();
  });

  it('with CTE', ({ expect }) => {
    const cte = db.$with('cte').as(db.select({ name: fullName }).from(users));
    const query = db.with(cte).select().from(cte);

    expect(query.toSQL()).toEqual({
      sql: 'with "cte" as (select "firstName" || \' \' || "lastName" as "name" from "users") select "name" from "cte"',
      params: [],
    });
    expect(db.dialect.casing.cache).toEqual(usersCache);
  });

  it('with CTE (with query builder)', ({ expect }) => {
    const cte = db.$with('cte').as((qb) => qb.select({ name: fullName }).from(users));
    const query = db.with(cte).select().from(cte);

    expect(query.toSQL()).toEqual({
      sql: 'with "cte" as (select "firstName" || \' \' || "lastName" as "name" from "users") select "name" from "cte"',
      params: [],
    });
    expect(db.dialect.casing.cache).toEqual(usersCache);
  });

  it('set operator', ({ expect }) => {
    const query = db
      .select({ first_name: users.first_name })
      .from(users)
      .union(db.select({ first_name: users.first_name }).from(users));

    expect(query.toSQL()).toEqual({
      sql: '(select "firstName" from "users") union (select "firstName" from "users")',
      params: [],
    });
    expect(db.dialect.casing.cache).toEqual(usersCache);
  });

  it('set operator (function)', ({ expect }) => {
    const query = union(
      db.select({ first_name: users.first_name }).from(users),
      db.select({ first_name: users.first_name }).from(users)
    );

    expect(query.toSQL()).toEqual({
      sql: '(select "firstName" from "users") union (select "firstName" from "users")',
      params: [],
    });
    expect(db.dialect.casing.cache).toEqual(usersCache);
  });

  it('select', ({ expect }) => {
    const query = db
      .select({ name: fullName, age: users.age })
      .from(users)
      .leftJoin(developers, eq(users.id, developers.user_id))
      .orderBy(asc(users.first_name));

    expect(query.toSQL()).toEqual({
      sql: 'select "users"."firstName" || \' \' || "users"."lastName" as "name", "users"."AGE" from "users" left join "test"."developers" on "users"."id" = "developers"."userId" order by "users"."firstName" asc',
      params: [],
    });
    expect(db.dialect.casing.cache).toEqual(cache);
  });

  it('select (with alias)', ({ expect }) => {
    const query = db
      .select({ first_name: users.first_name })
      .from(users)
      .leftJoin(devs, eq(users.id, devs.user_id));

    expect(query.toSQL()).toEqual({
      sql: 'select "users"."firstName" from "users" left join "test"."developers" "devs" on "users"."id" = "devs"."userId"',
      params: [],
    });
    expect(db.dialect.casing.cache).toEqual(cache);
  });

  it('insert (on conflict do nothing)', ({ expect }) => {
    const query = db
      .insert(users)
      .values({ first_name: 'John', last_name: 'Doe', age: 30 })
      .onConflictDoNothing({ target: users.first_name })
      .returning({ first_name: users.first_name, age: users.age });

    expect(query.toSQL()).toEqual({
      sql: 'insert into "users" ("id", "firstName", "lastName", "AGE") values (default, $1, $2, $3) on conflict ("firstName") do nothing returning "firstName", "AGE"',
      params: ['John', 'Doe', 30],
    });
    expect(db.dialect.casing.cache).toEqual(usersCache);
  });

  it('insert (on conflict do update)', ({ expect }) => {
    const query = db
      .insert(users)
      .values({ first_name: 'John', last_name: 'Doe', age: 30 })
      .onConflictDoUpdate({ target: users.first_name, set: { age: 31 } })
      .returning({ first_name: users.first_name, age: users.age });

    expect(query.toSQL()).toEqual({
      sql: 'insert into "users" ("id", "firstName", "lastName", "AGE") values (default, $1, $2, $3) on conflict ("firstName") do update set "AGE" = $4 returning "firstName", "AGE"',
      params: ['John', 'Doe', 30, 31],
    });
    expect(db.dialect.casing.cache).toEqual(usersCache);
  });

  it('update', ({ expect }) => {
    const query = db
      .update(users)
      .set({ first_name: 'John', last_name: 'Doe', age: 30 })
      .where(eq(users.id, 1))
      .returning({ first_name: users.first_name, age: users.age });

    expect(query.toSQL()).toEqual({
      sql: 'update "users" set "firstName" = $1, "lastName" = $2, "AGE" = $3 where "users"."id" = $4 returning "firstName", "AGE"',
      params: ['John', 'Doe', 30, 1],
    });
    expect(db.dialect.casing.cache).toEqual(usersCache);
  });

  it('delete', ({ expect }) => {
    const query = db
      .delete(users)
      .where(eq(users.id, 1))
      .returning({ first_name: users.first_name, age: users.age });

    expect(query.toSQL()).toEqual({
      sql: 'delete from "users" where "users"."id" = $1 returning "firstName", "AGE"',
      params: [1],
    });
    expect(db.dialect.casing.cache).toEqual(usersCache);
  });
});
